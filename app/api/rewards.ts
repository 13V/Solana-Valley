import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth, readPostBody, getSupabaseUrl, getServiceKey } from './_auth.js';

// POST /api/rewards
// Body: { wallet, message, signature }
// Verifies the wallet signature, then reads the wallet's reward ledger row from
// Supabase (service-role key, server-only). Amounts are BASE UNITS (integer
// strings); the client divides by 10^decimals for display. Responds:
//   { claimable, claimed, pending, decimals, symbol }
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

  // Display-only metadata; the real transfer in /api/claim uses the mint's own
  // units, so a wrong decimals here can never mis-pay — it only affects rendering.
  const decimals = Number(process.env.REWARD_DECIMALS ?? 6);
  const symbol = process.env.REWARD_SYMBOL ?? '$SPROUT';

  const url =
    `${getSupabaseUrl()}/rest/v1/rewards` +
    `?wallet=eq.${encodeURIComponent(auth.wallet)}&select=claimable,claimed,pending`;

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
      },
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('rewards read failed', resp.status, detail);
      res.status(502).json({ error: 'upstream read failed' });
      return;
    }

    const rows = (await resp.json()) as Array<{ claimable: string; claimed: string; pending: string }>;
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    res.status(200).json({
      claimable: String(row?.claimable ?? '0'),
      claimed: String(row?.claimed ?? '0'),
      pending: String(row?.pending ?? '0'),
      decimals,
      symbol,
    });
  } catch (err) {
    console.error('rewards read error', err);
    res.status(502).json({ error: 'upstream read error' });
  }
}
