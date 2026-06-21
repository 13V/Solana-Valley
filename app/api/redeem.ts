import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth, readPostBody, getSupabaseUrl, getServiceKey } from './_auth.js';

// POST /api/redeem
// Body: { wallet, message, signature, value, label? }
// Redeems a bag item (worth `value` COINS) for real $SPROUT, on demand. The
// crediting is done by the atomic `redeem_items` RPC, which converts coins →
// $SPROUT at the current pool rate and CLAMPS the payout to a daily budget + a
// per-wallet daily cap (supabase/redemption.sql) — so this can never drain the
// treasury no matter what `value` a client sends. The credited amount lands in
// the wallet's `claimable`; the player withdraws it via /api/claim. Responds:
//   { credited, decimals, symbol }   (credited '0' when capped / disabled)
//
// NOTE on trust: items are client-authoritative (like coins), so `value` is the
// client's assertion. That's acceptable here ONLY because the caps bound the
// outflow — a forged value just hits the per-wallet daily cap sooner, never more.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = readPostBody(req, res);
  if (!body) return;

  const auth = verifyAuth(body);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const serviceKey = getServiceKey();
  if (!serviceKey) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  // Item value in COINS. Reject non-positive / non-finite; floor to an integer.
  const rawValue = Number((body as { value?: unknown }).value);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    res.status(400).json({ error: 'value must be a positive number' });
    return;
  }
  const value = Math.floor(rawValue);

  const decimals = Number(process.env.REWARD_DECIMALS ?? 6);
  const symbol = process.env.REWARD_SYMBOL ?? '$SPROUT';

  try {
    const resp = await fetch(`${getSupabaseUrl()}/rest/v1/rpc/redeem_items`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_wallet: auth.wallet, p_item_value: value }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('redeem_items failed', resp.status, detail);
      res.status(502).json({ error: 'redeem failed' });
      return;
    }
    const credited = await resp.json(); // numeric scalar (base units), 0 if capped/off
    res.status(200).json({ credited: String(credited ?? '0'), decimals, symbol });
  } catch (err) {
    console.error('redeem error', err);
    res.status(502).json({ error: 'redeem error' });
  }
}
