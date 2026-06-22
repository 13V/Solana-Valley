import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth, readPostBody, getSupabaseUrl, getServiceKey } from './_auth.js';

// POST /api/redeem
// Body: { wallet, message, signature, plantId, mutationId, count }
// Trades a TOP-TIER crop (Divine/Prismatic/Celestial only) for real $LANDS, on
// demand. Payout is a FIXED whole-$LANDS amount per tier (Divine 100K, Prismatic
// 250K, Celestial 500K) × a capped special-variant multiplier (1×–2×) × count,
// then CLAMPED to a daily budget + per-wallet cap by the redeem_items RPC (so it
// can never drain the treasury). NOT USD-pegged — a fresh token's price is too
// volatile to peg to. Credits `claimable`; the player withdraws via /api/claim.
// Responds: { credited, decimals, symbol }.
//
// IMPORTANT: set `base_rate = 1` in redemption_config — this route already
// computes the $LANDS base-unit amount, and the RPC passes it through before
// clamping to the caps. The caps must be ≥ the largest single payout (a Rainbow
// Celestial = 1,000,000 $LANDS) or every redeem all-or-nothing-fails.

// Fixed whole-$LANDS payout per tradeable plant. KEEP IN SYNC with CLAIM_TOKENS in
// app/src/game/economy.ts. A plant not listed here is not tradeable for tokens.
const PLANT_TOKENS: Record<string, number> = {
  bluerose: 100_000,
  frostpumpkin: 100_000,
  starfruit: 250_000,
  moonpetal: 250_000,
  galaxyfruit: 500_000,
  voidbloom: 500_000,
};

// Capped special-variant multiplier (mutations). KEEP IN SYNC with CLAIM_MUT_MULT
// in app/src/game/economy.ts. Unknown/missing → 1×.
const MUT_MULT: Record<string, number> = {
  normal: 1,
  shiny: 1.25,
  frosted: 1.5,
  gold: 1.75,
  rainbow: 2,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = readPostBody(req, res);
  if (!body) return;

  const auth = verifyAuth(body);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const serviceKey = getServiceKey();
  const decimals = Number(process.env.REWARD_DECIMALS ?? 6);
  if (!serviceKey || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }
  const symbol = process.env.REWARD_SYMBOL ?? '$LANDS';

  // Validate the item: only the listed top-tier crops are tradeable.
  const plantId = String((body as { plantId?: unknown }).plantId ?? '');
  const tierTokens = PLANT_TOKENS[plantId];
  if (tierTokens === undefined) {
    res.status(400).json({ error: 'this crop is not tradeable for tokens' });
    return;
  }
  const count = Math.floor(Number((body as { count?: unknown }).count ?? 1));
  if (!Number.isFinite(count) || count <= 0) {
    res.status(400).json({ error: 'count must be a positive integer' });
    return;
  }
  // Capped special-variant bonus (1×–2×); unknown mutation → 1×.
  const mutationId = String((body as { mutationId?: unknown }).mutationId ?? 'normal');
  const mult = MUT_MULT[mutationId] ?? 1;

  // Fixed whole-token payout → base units. Round (amounts × the 1.25/1.5/1.75/2
  // mults are exact integers for these tiers) and guard overflow.
  const tokenBaseUnits = Math.round(tierTokens * mult * count * 10 ** decimals);
  if (!Number.isFinite(tokenBaseUnits) || tokenBaseUnits <= 0 || tokenBaseUnits > Number.MAX_SAFE_INTEGER) {
    res.status(400).json({ error: 'payout out of range' });
    return;
  }

  try {
    const resp = await fetch(`${getSupabaseUrl()}/rest/v1/rpc/redeem_items`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_wallet: auth.wallet, p_item_value: tokenBaseUnits }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('redeem_items failed', resp.status, detail);
      res.status(502).json({ error: 'redeem failed' });
      return;
    }
    const credited = await resp.json(); // base units credited (clamped to caps), 0 if capped/off
    res.status(200).json({ credited: String(credited ?? '0'), decimals, symbol });
  } catch (err) {
    console.error('redeem error', err);
    res.status(502).json({ error: 'redeem error' });
  }
}
