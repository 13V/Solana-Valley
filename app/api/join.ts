import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth, readPostBody, getSupabaseUrl, getServiceKey } from './_auth.js';

// POST /api/join
// Body: { wallet, message, signature }
// Verifies the wallet signature, then atomically assigns the wallet a STABLE
// (island, plot) seat in the `plots` table using the service-role key
// (server-only). Idempotent: a wallet that already has a row gets that same row
// back. Responds:
//   { island, plot, name }
//
// `plots` schema (see SQL the user must run):
//   create table plots (
//     wallet     text primary key,
//     island     int  not null,
//     plot       int  not null,
//     name       text not null,
//     updated_at timestamptz not null default now(),
//     unique (island, plot)
//   );
// RLS enabled, no policies -> only the service role (which bypasses RLS) can
// touch it, mirroring the `saves` table.

const PLOTS_PER_ISLAND = 20; // plots 0..19 on each island
const MAX_ATTEMPTS = 8; // bounded retries when a UNIQUE(island, plot) race loses

type PlotRow = { wallet: string; island: number; plot: number; name: string };

// Short, human-friendly label for a wallet: first 4 + last 4 base58 chars.
function shortWallet(wallet: string): string {
  if (wallet.length <= 9) return wallet;
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

// Build common PostgREST headers carrying the service-role key. NEVER returned
// to the client.
function authHeaders(serviceKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
}

// Fetch the existing plot row for a wallet, or null if none. Throws on transport
// error so the caller can turn it into a 502.
async function fetchExisting(
  baseUrl: string,
  serviceKey: string,
  wallet: string,
): Promise<PlotRow | null> {
  const url =
    `${baseUrl}/rest/v1/plots` +
    `?wallet=eq.${encodeURIComponent(wallet)}&select=wallet,island,plot,name`;
  const resp = await fetch(url, { method: 'GET', headers: authHeaders(serviceKey) });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('supabase plots lookup failed', resp.status, detail);
    throw new Error('lookup failed');
  }
  const rows = (await resp.json()) as PlotRow[];
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// Read the lowest free plot (0..19) on ONE specific island, or null if that
// island is full. Used to honour a caller's island preference so friends can
// land together.
async function findFreePlotOnIsland(
  baseUrl: string,
  serviceKey: string,
  island: number,
): Promise<{ island: number; plot: number } | null> {
  const url = `${baseUrl}/rest/v1/plots` + `?island=eq.${island}&select=plot`;
  const resp = await fetch(url, { method: 'GET', headers: authHeaders(serviceKey) });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('supabase plots island scan failed', resp.status, detail);
    throw new Error('island scan failed');
  }
  const rows = (await resp.json()) as Array<{ plot: number }>;
  const taken = new Set(rows.map((r) => r.plot));
  for (let plot = 0; plot < PLOTS_PER_ISLAND; plot++) {
    if (!taken.has(plot)) return { island, plot };
  }
  return null; // island full
}

// Find the lowest free (island, plot): scan island 0 plots 0..19, then island 1,
// etc. For each island we read the taken plots once and pick the lowest 0..19 not
// in that set; if the island is full we advance. Bounded so a pathological state
// can't loop forever.
async function findLowestFreeSlot(
  baseUrl: string,
  serviceKey: string,
): Promise<{ island: number; plot: number }> {
  // Safety ceiling: with bounded attempts upstream this is plenty of headroom.
  for (let island = 0; island < 10000; island++) {
    const url =
      `${baseUrl}/rest/v1/plots` +
      `?island=eq.${island}&select=plot`;
    const resp = await fetch(url, { method: 'GET', headers: authHeaders(serviceKey) });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('supabase plots scan failed', resp.status, detail);
      throw new Error('scan failed');
    }
    const rows = (await resp.json()) as Array<{ plot: number }>;
    const taken = new Set(rows.map((r) => r.plot));
    for (let plot = 0; plot < PLOTS_PER_ISLAND; plot++) {
      if (!taken.has(plot)) return { island, plot };
    }
    // Island full -> try the next one.
  }
  throw new Error('no free slot');
}

// Try to INSERT a claim for (island, plot). Returns the inserted row on success,
// 'conflict' if the slot (or wallet) was taken by a concurrent request, or
// throws on transport/other errors.
async function tryClaim(
  baseUrl: string,
  serviceKey: string,
  row: PlotRow,
): Promise<PlotRow | 'conflict'> {
  const url = `${baseUrl}/rest/v1/plots`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: authHeaders(serviceKey, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      wallet: row.wallet,
      island: row.island,
      plot: row.plot,
      name: row.name,
      updated_at: new Date().toISOString(),
    }),
  });

  if (resp.status === 409) {
    // 23505 unique_violation surfaces as HTTP 409 from PostgREST: either this
    // wallet was inserted concurrently, or someone grabbed this (island, plot).
    await resp.text().catch(() => '');
    return 'conflict';
  }
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('supabase plots insert failed', resp.status, detail);
    throw new Error('insert failed');
  }

  const inserted = (await resp.json()) as PlotRow[];
  if (Array.isArray(inserted) && inserted.length > 0) return inserted[0];
  // return=representation should give us the row; fall back to the input.
  return row;
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
  if (!serviceKey) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  const baseUrl = getSupabaseUrl();
  const wallet = auth.wallet;
  const name = shortWallet(wallet);

  // Optional island preference (e.g. an invite link): claim a seat on this
  // island if it has room. Coerce to a non-negative integer; ignore anything
  // else. `preferIsland` is null once the island fills, so we fall back.
  let preferIsland: number | null = null;
  const raw = body.preferIsland;
  if (typeof raw === 'number' || typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) preferIsland = n;
  }

  try {
    // Fast path: already seated -> return the existing assignment (preference is
    // ignored once a wallet owns a plot, so seats stay stable).
    const existing = await fetchExisting(baseUrl, serviceKey, wallet);
    if (existing) {
      res.status(200).json({ island: existing.island, plot: existing.plot, name: existing.name });
      return;
    }

    // Claim a free slot, retrying on a lost UNIQUE(island, plot) race. When an
    // island is preferred and not yet full we target it; otherwise (or once it
    // fills) we fall back to the lowest free slot across all islands.
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let slot: { island: number; plot: number } | null = null;
      if (preferIsland !== null) {
        slot = await findFreePlotOnIsland(baseUrl, serviceKey, preferIsland);
        if (!slot) preferIsland = null; // preferred island full -> stop trying it
      }
      if (!slot) slot = await findLowestFreeSlot(baseUrl, serviceKey);
      const result = await tryClaim(baseUrl, serviceKey, {
        wallet,
        island: slot.island,
        plot: slot.plot,
        name,
      });

      if (result === 'conflict') {
        // Either our wallet got inserted by a concurrent request, or the slot
        // was taken. Re-check our own row first (idempotent win), else retry.
        const now = await fetchExisting(baseUrl, serviceKey, wallet);
        if (now) {
          res.status(200).json({ island: now.island, plot: now.plot, name: now.name });
          return;
        }
        continue; // slot stolen -> find the next free one
      }

      res.status(200).json({ island: result.island, plot: result.plot, name: result.name });
      return;
    }

    // Exhausted retries under heavy contention.
    res.status(503).json({ error: 'could not assign a plot, please retry' });
  } catch (err) {
    console.error('plot assignment error', err);
    res.status(502).json({ error: 'plot assignment failed' });
  }
}
