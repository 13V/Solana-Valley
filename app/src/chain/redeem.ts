// Client-side item redemption: turn a bag item into a claimable $SPROUT balance
// on demand (the React glue is in BagPanel.tsx). The browser proves wallet
// ownership with the once-per-session signature and calls our /api/redeem, which
// credits the wallet's `claimable` from a CAPPED, revenue-funded daily pool (see
// docs/REWARDS.md and supabase/redemption.sql). The player then withdraws that
// claimable to their wallet via the existing claim widget (chain/rewards.ts).
//
// Best-effort: a network/signing failure must never break gameplay.

import type { WalletAuth } from './walletAuth';

export type RedeemResult = {
  credited: string; // base units credited to claimable (string; '0' if capped/off)
  decimals: number;
  symbol: string;
};

// Redeem an item worth `value` COINS (its in-game value). The server converts
// coins → $SPROUT at the current pool rate, clamped to the daily + per-wallet
// caps, and credits the wallet's claimable. `label` is for the server-side audit
// log only. Returns null on any failure (caller leaves the item in the bag).
export async function redeemValue(
  session: WalletAuth,
  value: number,
  label: string,
): Promise<RedeemResult | null> {
  let resp: Response;
  try {
    resp = await fetch('/api/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...session, value, label }),
    });
  } catch {
    return null;
  }
  if (!resp.ok) return null;
  try {
    return (await resp.json()) as RedeemResult;
  } catch {
    return null;
  }
}
