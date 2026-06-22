// Reconcile stuck `pending` reward claims against the chain (self-healing cron).
//
// /api/claim reserves a claim (pending = amount), broadcasts the treasury transfer,
// then finalizes. If confirmation is AMBIGUOUS (RPC timeout — the tx may have
// landed) it deliberately leaves the claim `pending` (with the signature stamped
// in `pending_sig`) rather than risk a refund-after-pay double-spend. Those stuck
// rows wedge the wallet (reserve_claim refuses while pending > 0) until something
// checks the chain. This job is that something. For each stuck row:
//   • signature landed OK         → finalize_claim (pending → claimed, logged)
//   • signature landed but FAILED → cancel_claim   (refund — no tokens moved)
//   • no signature / not found    → cancel_claim, but ONLY after a grace period
//                                   (by then the blockhash has expired, so the tx
//                                   can never land later — safe to refund)
//   • still in-flight (recent)    → leave it for the next run
//
// Needs NO treasury key — it only READS the chain (getSignatureStatuses) and calls
// the guarded finalize/cancel RPCs via the Supabase service key. Idempotent and
// safe to run on a schedule (every ~10 min); see .github/workflows/reconcile-claims.yml.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SOLANA_RPC_URL,
//      RECONCILE_GRACE_MS (default 300000 = 5 min). Use an RPC that retains
//      transaction history (Helius/Triton) so a landed tx is never seen as "not
//      found". Exits 0 (no-op) when unconfigured, so a scheduled run is harmless
//      before launch. Pass --dry-run to preview without writing.

import { Connection } from '@solana/web3.js';

const GRACE_MS = Number(process.env.RECONCILE_GRACE_MS) || 5 * 60 * 1000;
const dryRun = process.argv.includes('--dry-run');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rpcUrl = process.env.SOLANA_RPC_URL;
if (!url || !key || !rpcUrl) {
  console.log('reconcile-claims: not configured (need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SOLANA_RPC_URL) — skipping.');
  process.exit(0);
}
const base = url.replace(/\/+$/, '');

const short = (w) => (w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w);

function headers() {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function rest(method, path, body) {
  const resp = await fetch(`${base}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${method} ${path} failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

const connection = new Connection(rpcUrl, 'confirmed');

// Every wallet currently mid-claim (pending > 0). Service key bypasses RLS.
const rows = await rest('GET', '/rest/v1/rewards?pending=gt.0&select=wallet,pending,pending_at,pending_sig');
if (!rows || rows.length === 0) {
  console.log('reconcile-claims: no pending claims. Nothing to do.');
  process.exit(0);
}
console.log(`reconcile-claims: ${rows.length} pending claim(s)${dryRun ? ' [dry-run]' : ''}…`);

let finalized = 0;
let cancelled = 0;
let skipped = 0;

for (const r of rows) {
  const ageMs = r.pending_at ? Date.now() - Date.parse(r.pending_at) : Infinity;

  // Did the stamped signature land on-chain? true=landed ok, false=landed&failed,
  // null=unknown (no sig, or not found yet).
  let landed = null;
  if (r.pending_sig) {
    try {
      const st = await connection.getSignatureStatuses([r.pending_sig], { searchTransactionHistory: true });
      const s = st.value[0];
      if (s) landed = !s.err;
    } catch (e) {
      console.error(`  ${short(r.wallet)}: status check failed (${e.message || e}) — leaving`);
      skipped++;
      continue;
    }
  }

  let action;
  if (landed === true) action = 'finalize';
  else if (landed === false) action = 'cancel'; // ran but failed → tokens not moved
  else action = ageMs > GRACE_MS ? 'cancel' : 'skip'; // unknown → only refund once expired

  if (action === 'skip') {
    skipped++;
    console.log(`  ${short(r.wallet)}: in-flight (${Math.round(ageMs / 1000)}s old) — leaving for next run`);
    continue;
  }

  if (dryRun) {
    if (action === 'finalize') finalized++;
    else cancelled++;
    console.log(`  ${short(r.wallet)}: would ${action}${r.pending_sig ? ` (tx ${r.pending_sig.slice(0, 8)}…)` : ''}`);
    continue;
  }

  try {
    if (action === 'finalize') {
      await rest('POST', '/rest/v1/rpc/finalize_claim', { p_wallet: r.wallet, p_signature: r.pending_sig });
      finalized++;
      console.log(`  ${short(r.wallet)}: ✓ finalized (tx ${r.pending_sig.slice(0, 8)}…)`);
    } else {
      await rest('POST', '/rest/v1/rpc/cancel_claim', { p_wallet: r.wallet });
      cancelled++;
      console.log(`  ${short(r.wallet)}: ↩ refunded (no tokens moved)`);
    }
  } catch (e) {
    // A concurrent claim/run may have already resolved this row (finalize raises
    // when pending is already 0) — count as skipped, not fatal.
    skipped++;
    console.error(`  ${short(r.wallet)}: ${action} failed (${e.message || e})`);
  }
}

console.log(`reconcile-claims: ${finalized} finalized, ${cancelled} refunded, ${skipped} left (of ${rows.length}).`);
