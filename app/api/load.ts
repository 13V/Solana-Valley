import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth, readPostBody, getSupabaseUrl, getServiceKey } from './_auth.js';

// POST /api/load
// Body: { wallet, message, signature }
// Verifies the wallet signature, then reads the player's save row from Supabase
// using the service-role key (server-only). Responds:
//   { data: <json>|null, updated_at: <string>|null }
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
    // Misconfiguration: never leak details, just fail clearly.
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  const url =
    `${getSupabaseUrl()}/rest/v1/saves` +
    `?wallet=eq.${encodeURIComponent(auth.wallet)}&select=data,updated_at`;

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
      // Log server-side only; do not echo the service key or raw upstream body.
      console.error('supabase load failed', resp.status, detail);
      res.status(502).json({ error: 'upstream read failed' });
      return;
    }

    const rows = (await resp.json()) as Array<{ data: unknown; updated_at: string }>;
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    res.status(200).json({
      data: row ? row.data : null,
      updated_at: row ? row.updated_at : null,
    });
  } catch (err) {
    console.error('supabase load error', err);
    res.status(502).json({ error: 'upstream read error' });
  }
}
