import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth, readPostBody, getSupabaseUrl, getServiceKey } from './_auth.js';

// POST /api/save
// Body: { wallet, message, signature, data }
// Verifies the wallet signature, then upserts the player's save row into
// Supabase using the service-role key (server-only). Responds:
//   { ok: true, updated_at }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = readPostBody(req, res);
  if (!body) return;

  const auth = verifyAuth(body);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  // `data` is the save object; require it to be present (jsonb is NOT NULL).
  if (!('data' in body) || body.data === undefined || body.data === null) {
    res.status(400).json({ error: 'data is required' });
    return;
  }

  const serviceKey = getServiceKey();
  if (!serviceKey) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  const updatedAt = new Date().toISOString();
  const url = `${getSupabaseUrl()}/rest/v1/saves`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        // Upsert on the wallet primary key; return nothing to keep it light.
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        wallet: auth.wallet,
        data: body.data,
        updated_at: updatedAt,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('supabase upsert failed', resp.status, detail);
      res.status(502).json({ error: 'upstream write failed' });
      return;
    }

    res.status(200).json({ ok: true, updated_at: updatedAt });
  } catch (err) {
    console.error('supabase upsert error', err);
    res.status(502).json({ error: 'upstream write error' });
  }
}
