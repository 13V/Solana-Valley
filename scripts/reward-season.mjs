// Ops CLI for the seasonal contribution-score distribution (see docs/REWARDS.md
// and supabase/seasons.sql). Capped-pool-by-share: a season has a fixed $SPROUT
// pool that is split across wallets PROPORTIONALLY by contribution score.
//
// Subcommands:
//   open <poolTokens> [label]     Create a season with pool = <poolTokens> whole
//                                 tokens. Prints the new season id.
//   list                          List seasons (id, label, pool, status, dates).
//   distribute <seasonId> [--dry-run]
//                                 Fetch the (open) season, score every save,
//                                 split the pool by score, print the table, then
//                                 (unless --dry-run) credit every wallet's
//                                 claimable in one atomic RPC and close the
//                                 season.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both required),
//      REWARD_DECIMALS (default 6).
//
// The scoring math lives in ./lib/contribution.mjs (pure). This script only does
// I/O: read saves/seasons, print, and call the distribute_season RPC.

import { scoreFromSave, allocate } from './lib/contribution.mjs';

const DECIMALS = Number(process.env.REWARD_DECIMALS ?? 6);
const cmd = process.argv[2];

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// Whole-token amount (possibly fractional) -> base units (BigInt).
function toBaseUnits(amountStr) {
  const [whole, frac = ''] = String(amountStr).split('.');
  const fracPadded = (frac + '0'.repeat(DECIMALS)).slice(0, DECIMALS);
  return BigInt(whole || '0') * 10n ** BigInt(DECIMALS) + BigInt(fracPadded || '0');
}

// Base units (BigInt or numeric string) -> human whole-token string.
function fromBaseUnits(base) {
  const b = BigInt(base);
  const div = 10n ** BigInt(DECIMALS);
  const whole = b / div;
  const frac = (b % div).toString().padStart(DECIMALS, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function shortWallet(w) {
  return w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

function supabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return { base: url.replace(/\/+$/, ''), key };
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
}

async function rest(method, path, { body, headers: extra } = {}) {
  const { base, key } = supabaseEnv();
  const resp = await fetch(`${base}${path}`, {
    method,
    headers: headers(key, extra),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok) {
    die(`${method} ${path} failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

async function openCmd(poolTokens, label) {
  if (!poolTokens) die('usage: open <poolTokens> [label]');
  const pool = toBaseUnits(poolTokens).toString();
  const rows = await rest('POST', '/rest/v1/seasons', {
    body: { pool, label: label ?? null },
    headers: { Prefer: 'return=representation' },
  });
  const season = Array.isArray(rows) ? rows[0] : rows;
  if (!season || season.id == null) die('open: no season returned');
  console.log(
    `✓ Opened season #${season.id}` +
      (label ? ` "${label}"` : '') +
      ` with pool ${poolTokens} tokens (${pool} base units).`
  );
}

async function listCmd() {
  const rows = await rest(
    'GET',
    '/rest/v1/seasons?select=id,label,pool,status,created_at,distributed_at&order=id.desc'
  );
  if (!rows || rows.length === 0) {
    console.log('No seasons yet. Create one with: node scripts/reward-season.mjs open <poolTokens> [label]');
    return;
  }
  console.log('id   status       pool             label / dates');
  console.log('---  -----------  ---------------  ------------------------------');
  for (const s of rows) {
    const id = String(s.id).padEnd(3);
    const status = String(s.status).padEnd(11);
    const pool = `${fromBaseUnits(s.pool)}`.padEnd(15);
    const label = s.label || '(no label)';
    const when =
      s.status === 'distributed' && s.distributed_at
        ? `distributed ${s.distributed_at}`
        : `created ${s.created_at}`;
    console.log(`${id}  ${status}  ${pool}  ${label} — ${when}`);
  }
}

async function distributeCmd(seasonId, flags) {
  if (!seasonId) die('usage: distribute <seasonId> [--dry-run]');
  const dryRun = flags.includes('--dry-run');

  // 1. Fetch the season; it must exist and be open.
  const seasons = await rest(
    'GET',
    `/rest/v1/seasons?id=eq.${encodeURIComponent(seasonId)}&select=id,label,pool,status`
  );
  const season = seasons && seasons[0];
  if (!season) die(`season ${seasonId} not found`);
  if (season.status !== 'open') die(`season ${seasonId} is not open (status=${season.status})`);
  const pool = BigInt(season.pool);
  console.log(
    `Season #${season.id}${season.label ? ` "${season.label}"` : ''} — pool ${fromBaseUnits(pool)} tokens (${pool} base units)\n`
  );

  // 2. Fetch every save and score it.
  const saves = await rest('GET', '/rest/v1/saves?select=wallet,data');
  if (!saves || saves.length === 0) {
    console.log('No saves found — nothing to distribute. Season left open.');
    return;
  }

  const scored = saves.map((s) => ({ wallet: s.wallet, score: scoreFromSave(s.data) }));
  const totalScore = scored.reduce((acc, r) => acc + r.score, 0);
  if (totalScore <= 0) {
    console.log(`${saves.length} save(s) found but total contribution score is 0 — nothing to distribute. Season left open.`);
    return;
  }

  // 3. Split the pool by score (largest-remainder so it sums exactly to pool).
  const allocations = allocate(pool, scored);

  // 4. Print a readable table (sorted by credited desc).
  const sorted = [...allocations].sort((a, b) => {
    const d = BigInt(b.credited) - BigInt(a.credited);
    return d > 0n ? 1 : d < 0n ? -1 : 0;
  });
  console.log('wallet           score      credited ($SPROUT)');
  console.log('---------------  ---------  ------------------');
  for (const a of sorted) {
    console.log(
      `${shortWallet(a.wallet).padEnd(15)}  ${a.score.toFixed(2).padStart(9)}  ${fromBaseUnits(a.credited).padStart(18)}`
    );
  }
  const creditedSum = allocations.reduce((acc, a) => acc + BigInt(a.credited), 0n);
  console.log(
    `\n${allocations.length} wallet(s); total credited ${fromBaseUnits(creditedSum)} / pool ${fromBaseUnits(pool)} (${creditedSum === pool ? 'exact' : 'MISMATCH'}).`
  );

  // 5. Build a lean payload: drop wallets credited 0.
  const payload = allocations.filter((a) => BigInt(a.credited) > 0n);

  if (dryRun) {
    console.log(`\n[dry-run] Would credit ${payload.length} wallet(s) and close season #${season.id}. No changes made.`);
    return;
  }

  if (payload.length === 0) {
    console.log('\nNo wallet has a positive credit — nothing to send. Season left open.');
    return;
  }

  // 6. Atomic distribution: records allocations, credits claimable, closes season.
  const applied = await rest('POST', '/rest/v1/rpc/distribute_season', {
    body: { p_season_id: Number(seasonId), p_allocations: payload },
  });
  console.log(`\n✓ Distributed season #${season.id}: credited ${applied} wallet(s). Season closed.`);
}

switch (cmd) {
  case 'open':
    await openCmd(process.argv[3], process.argv[4]);
    break;
  case 'list':
    await listCmd();
    break;
  case 'distribute':
    await distributeCmd(process.argv[3], process.argv.slice(4));
    break;
  default:
    console.log(
      'Usage: node scripts/reward-season.mjs <open <poolTokens> [label] | list | distribute <seasonId> [--dry-run]>'
    );
    process.exit(cmd ? 1 : 0);
}
