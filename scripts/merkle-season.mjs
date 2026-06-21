// Ops CLI for the TRUSTLESS merkle reward distributor (see programs/reward-distributor,
// supabase/distributors.sql, and docs/REWARDS.md). The custodial path
// (reward-season.mjs) has the treasury sign every payout; this path instead
// commits a season's allocations to a single merkle ROOT, publishes the root +
// per-wallet proofs, and lets each wallet claim its own tokens directly from an
// on-chain distributor account by presenting its leaf + proof. The treasury never
// signs an individual claim.
//
// Subcommands:
//   build <poolTokens> [label] [--dry-run]
//                                 Score every save, split <poolTokens> whole tokens
//                                 by contribution share, build a merkle tree, print
//                                 the table + root + total, then (unless --dry-run)
//                                 publish a distributors row + every wallet's proof
//                                 to Supabase and print the on-chain create args.
//   set-onchain <seasonId> <distributorPubkey> [tx]
//                                 Backfill the distributor's on-chain pubkey (and
//                                 create tx) after it's created on-chain, so the
//                                 client knows which distributor to claim against.
//   list                          List published distributors (id, label, root,
//                                 total, on-chain pubkey or "(not on-chain yet)").
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both required),
//      REWARD_MINT (required for build), REWARD_DECIMALS (default 6).
//
// The scoring math lives in ./lib/contribution.mjs and the leaf/proof hashing in
// ./lib/merkle.mjs (both pure, canonical, must match the Rust program). This
// script only does I/O: read saves, build the tree, print, and write the public
// distributors + distributor_claims rows.

import { scoreFromSave, allocate } from './lib/contribution.mjs';
import { buildTree } from './lib/merkle.mjs';

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

function shortHash(h) {
  return h && h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h || '';
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

async function buildCmd(poolTokens, args) {
  if (!poolTokens) die('usage: build <poolTokens> [label] [--dry-run]');
  const flags = args.filter((a) => a.startsWith('--'));
  const positional = args.filter((a) => !a.startsWith('--'));
  const label = positional[0] ?? null;
  const dryRun = flags.includes('--dry-run');

  const mint = process.env.REWARD_MINT;
  if (!dryRun && !mint) die('REWARD_MINT is required to publish a distributor');

  const pool = toBaseUnits(poolTokens);
  console.log(
    `Building distributor${label ? ` "${label}"` : ''} — pool ${poolTokens} tokens (${pool} base units)\n`
  );

  // a. Fetch every save.
  const saves = await rest('GET', '/rest/v1/saves?select=wallet,data');
  if (!saves || saves.length === 0) {
    console.log('No saves found — nothing to distribute. No tree built.');
    return;
  }

  // b. Score each save; bail if there's nothing to split.
  const scored = saves.map((s) => ({ wallet: s.wallet, score: scoreFromSave(s.data) }));
  const totalScore = scored.reduce((acc, r) => acc + r.score, 0);
  if (totalScore <= 0) {
    console.log(`${saves.length} save(s) found but total contribution score is 0 — nothing to distribute. No tree built.`);
    return;
  }

  // c. Split the pool by score (largest-remainder so it sums exactly to pool).
  const allocations = allocate(pool, scored);

  // d. Build the merkle tree. Leaf index = array position, so keep order stable.
  const tree = buildTree(allocations.map((a) => ({ wallet: a.wallet, amount: a.credited })));

  // e. Print a readable table (sorted by credited desc).
  const sorted = [...allocations].sort((a, b) => {
    const d = BigInt(b.credited) - BigInt(a.credited);
    return d > 0n ? 1 : d < 0n ? -1 : 0;
  });
  console.log('wallet           credited ($SPROUT)');
  console.log('---------------  ------------------');
  for (const a of sorted) {
    console.log(`${shortWallet(a.wallet).padEnd(15)}  ${fromBaseUnits(a.credited).padStart(18)}`);
  }
  const creditedSum = allocations.reduce((acc, a) => acc + BigInt(a.credited), 0n);
  console.log(
    `\n${allocations.length} wallet(s); total credited ${fromBaseUnits(creditedSum)} / pool ${fromBaseUnits(pool)} (${creditedSum === pool ? 'exact' : 'MISMATCH'}).`
  );
  console.log(`\nmerkle root : ${tree.root}`);
  console.log(`total       : ${tree.total} base units (${fromBaseUnits(tree.total)} tokens)`);

  if (dryRun) {
    console.log(`\n[dry-run] Would publish a distributor + ${allocations.filter((a) => BigInt(a.credited) > 0n).length} proof(s). No changes made.`);
    return;
  }

  // f. Publish: insert the distributors row (to get the season_id), then insert
  //    every non-zero wallet's leaf + proof in batched POSTs.
  const rows = await rest('POST', '/rest/v1/distributors', {
    body: { label, mint, root: tree.root, total: tree.total },
    headers: { Prefer: 'return=representation' },
  });
  const distributor = Array.isArray(rows) ? rows[0] : rows;
  if (!distributor || distributor.season_id == null) die('build: no distributor returned');
  const seasonId = distributor.season_id;

  const claims = tree.leaves
    .filter((l) => BigInt(l.amount) > 0n)
    .map((l) => ({
      season_id: seasonId,
      wallet: l.wallet,
      idx: l.index,
      amount: l.amount,
      proof: tree.proofFor(l.index),
    }));
  if (claims.length > 0) {
    // PostgREST accepts an array of rows in one POST (batched insert).
    await rest('POST', '/rest/v1/distributor_claims', { body: claims });
  }

  // g. Report + the exact on-chain create args.
  console.log(`\n✓ Published distributor season #${seasonId}: ${claims.length} claimable proof(s).`);
  console.log(`  root  : ${tree.root}`);
  console.log(`  total : ${tree.total} base units (${fromBaseUnits(tree.total)} tokens)`);
  console.log('\nNext: create the distributor on-chain (see programs/reward-distributor/DEPLOY.md):');
  console.log(
    `  new_distributor(season_id=${seasonId}, root=${tree.root}, total=${tree.total}, clawback_after=0)`
  );
  console.log('  (set clawback_after to a unix timestamp to allow reclaiming unclaimed tokens after it, or 0 for none)');
  console.log(`\nThen record the on-chain account so the client can claim:\n  node scripts/merkle-season.mjs set-onchain ${seasonId} <distributorPubkey> [tx]`);
}

async function setOnchainCmd(seasonId, distributorPubkey, tx) {
  if (!seasonId || !distributorPubkey) {
    die('usage: set-onchain <seasonId> <distributorPubkey> [tx]');
  }
  const updated = await rest(
    'PATCH',
    `/rest/v1/distributors?season_id=eq.${encodeURIComponent(seasonId)}`,
    {
      body: { distributor_pubkey: distributorPubkey, tx: tx ?? null },
      headers: { Prefer: 'return=representation' },
    }
  );
  if (!updated || updated.length === 0) die(`distributor season ${seasonId} not found`);
  console.log(
    `✓ Distributor season #${seasonId} is now on-chain: ${distributorPubkey}` +
      (tx ? ` (tx ${tx})` : '')
  );
}

async function listCmd() {
  const rows = await rest(
    'GET',
    '/rest/v1/distributors?select=season_id,label,root,total,distributor_pubkey&order=season_id.desc'
  );
  if (!rows || rows.length === 0) {
    console.log('No distributors yet. Create one with: node scripts/merkle-season.mjs build <poolTokens> [label]');
    return;
  }
  console.log('id   total           root              label / on-chain');
  console.log('---  --------------  ----------------  ------------------------------');
  for (const d of rows) {
    const id = String(d.season_id).padEnd(3);
    const total = `${fromBaseUnits(d.total)}`.padEnd(14);
    const root = shortHash(d.root).padEnd(16);
    const label = d.label || '(no label)';
    const onchain = d.distributor_pubkey ? d.distributor_pubkey : '(not on-chain yet)';
    console.log(`${id}  ${total}  ${root}  ${label} — ${onchain}`);
  }
}

switch (cmd) {
  case 'build':
    await buildCmd(process.argv[3], process.argv.slice(4));
    break;
  case 'set-onchain':
    await setOnchainCmd(process.argv[3], process.argv[4], process.argv[5]);
    break;
  case 'list':
    await listCmd();
    break;
  default:
    console.log(
      'Usage: node scripts/merkle-season.mjs <build <poolTokens> [label] [--dry-run] | set-onchain <seasonId> <distributorPubkey> [tx] | list>'
    );
    process.exit(cmd ? 1 : 0);
}
