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

// Trade `count` of a top-tier crop (`plantId`) for real $LANDS. The server pays a
// flat USD value per tier, converts it to $LANDS at the current price, clamps to
// the daily + per-wallet caps, and credits the wallet's claimable. Returns null
// on any failure (caller leaves the item in the bag). A non-tradeable plant or a
// capped/empty pool resolves with `credited: '0'` (or null on a 4xx).
export async function redeemPlant(
  session: WalletAuth,
  plantId: string,
  mutationId: string,
  count: number,
): Promise<RedeemResult | null> {
  let resp: Response;
  try {
    resp = await fetch('/api/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...session, plantId, mutationId, count }),
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
