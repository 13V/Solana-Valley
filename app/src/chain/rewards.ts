// Client-side reward-claim logic (framework-agnostic; the React glue lives in
// RewardsClaim.tsx).
//
// Players earn a CLAIMABLE balance of real $SPROUT (credited server-side from
// revenue — see docs/REWARDS.md). Claiming pays it out of the treasury. Like
// cloud save, the browser proves wallet ownership with the once-per-session
// signature and never touches the treasury key or the Supabase service key — it
// only calls our own /api/rewards and /api/claim endpoints. Everything is
// best-effort: a network/signing failure must never break gameplay.

import type { WalletAuth } from './walletAuth';

export type SignedSession = WalletAuth;

// Ledger amounts arrive as base-unit strings (integer, token × 10^decimals) so
// no precision is lost in JSON; format with `formatAmount` for display.
export type Rewards = {
  claimable: string;
  claimed: string;
  pending: string;
  decimals: number;
  symbol: string;
};

export type ClaimResult =
  | { ok: true; signature: string; amount: string }
  | { ok: false; reason: string };

// POST helper that always resolves (never throws) so callers stay best-effort.
async function postJson(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

// Fetch the wallet's reward ledger. Returns null on any failure.
export async function fetchRewards(session: SignedSession): Promise<Rewards | null> {
  const resp = await postJson('/api/rewards', session);
  if (!resp || !resp.ok) return null;
  try {
    return (await resp.json()) as Rewards;
  } catch {
    return null;
  }
}

// Claim the wallet's claimable balance out of the treasury. Resolves to the
// outcome (incl. the tx signature on success), or a reason on failure.
export async function claimRewards(session: SignedSession): Promise<ClaimResult> {
  const resp = await postJson('/api/claim', session);
  if (!resp) return { ok: false, reason: 'network error' };
  let json: unknown = null;
  try {
    json = await resp.json();
  } catch {
    /* fall through to status-based handling */
  }
  const data = (json ?? {}) as {
    ok?: boolean;
    signature?: string;
    amount?: string;
    reason?: string;
    error?: string;
  };
  if (resp.ok && data.ok && data.signature) {
    return { ok: true, signature: data.signature, amount: data.amount ?? '0' };
  }
  return { ok: false, reason: data.reason || data.error || `failed (${resp.status})` };
}

// Format a base-unit string into a human token amount (trims trailing zeros).
export function formatAmount(baseUnits: string, decimals: number): string {
  let n: bigint;
  try {
    n = BigInt(baseUnits || '0');
  } catch {
    return '0';
  }
  if (decimals <= 0) return n.toString();
  const denom = 10n ** BigInt(decimals);
  const whole = n / denom;
  const frac = n % denom;
  if (frac === 0n) return whole.toLocaleString();
  // Up to 4 fractional digits, trailing zeros removed.
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}
