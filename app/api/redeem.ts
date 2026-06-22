import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth, readPostBody, getSupabaseUrl, getServiceKey } from './_auth.js';

// POST /api/redeem
// Body: { wallet, message, signature, plantId, mutationId, count }
// Trades a TOP-TIER crop (Divine/Prismatic/Celestial only) for real $LANDS, on
// demand. Payout is a FLAT USD value per tier (Divine $2.50, Prismatic $5,
// Celestial $10) × a capped special-variant multiplier (1×–2×), converted to
// $LANDS at the current price, then CLAMPED to a daily budget + per-wallet cap by
// the redeem_items RPC (so it can never drain the treasury). Credits `claimable`;
// the player withdraws via /api/claim. Responds: { credited, decimals, symbol }.
//
// IMPORTANT: set `base_rate = 1` in redemption_config — this route already
// computes the $LANDS base-unit amount, and the RPC passes it through (× base_rate
// × rate_mult) before clamping to the caps.

// Flat USD payout per tradeable plant. KEEP IN SYNC with CLAIM_USD in
// app/src/game/economy.ts. A plant not listed here is not tradeable for tokens.
const PLANT_USD: Record<string, number> = {
  bluerose: 2.5,
  frostpumpkin: 2.5,
  starfruit: 5,
  moonpetal: 5,
  galaxyfruit: 10,
  voidbloom: 10,
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

// $LANDS price in USD. A manual override (LANDS_USD_PRICE) wins — recommended for
// a fresh pump.fun token that price aggregators may not index yet; otherwise we
// ask Jupiter's price API. Returns null if neither is available (fail safe).
async function landsUsdPrice(mint: string): Promise<number | null> {
  const override = Number(process.env.LANDS_USD_PRICE);
  if (Number.isFinite(override) && override > 0) return override;
  try {
    const api = process.env.JUPITER_PRICE_API || 'https://lite-api.jup.ag/price/v2';
    const resp = await fetch(`${api}?ids=${mint}`);
    if (!resp.ok) return null;
    const json = (await resp.json()) as { data?: Record<string, { price?: string | number }> };
    const p = Number(json?.data?.[mint]?.price);
    return Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = readPostBody(req, res);
  if (!body) return;

  const auth = verifyAuth(body);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const serviceKey = getServiceKey();
  const mint = process.env.REWARD_MINT;
  if (!serviceKey || !mint) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  // Validate the item: only the listed top-tier crops are tradeable.
  const plantId = String((body as { plantId?: unknown }).plantId ?? '');
  const usdEach = PLANT_USD[plantId];
  if (usdEach === undefined) {
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

  const decimals = Number(process.env.REWARD_DECIMALS ?? 6);
  const symbol = process.env.REWARD_SYMBOL ?? '$LANDS';

  const price = await landsUsdPrice(mint);
  if (price === null) {
    res.status(503).json({ error: 'token price unavailable — set LANDS_USD_PRICE' });
    return;
  }

  // USD value → $LANDS base units at the current price.
  const usd = usdEach * mult * count;
  const tokenBaseUnits = Math.round((usd / price) * 10 ** decimals);
  if (!Number.isFinite(tokenBaseUnits) || tokenBaseUnits <= 0) {
    res.status(400).json({ error: 'computed payout is zero' });
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
