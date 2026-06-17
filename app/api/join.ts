import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth, readPostBody, getSupabaseUrl, getServiceKey } from './_auth.js';

// POST /api/join
// Body: { wallet, message, signature }
// Verifies the wallet signature, then assigns the wallet a (mostly) STABLE
// (island, plot) seat in the `plots` table using the service-role key
// (server-only). Doubles as the HEARTBEAT: an existing wallet's row is refreshed
// (updated_at = now()) on every call. Responds:
//   { island, plot, name }
//
// PLOT RECLAMATION (no new DB column): a plot is considered "left/stale" when
// `now - updated_at > STALE_MS`. A plot is AVAILABLE when it has NO row OR its
// row is stale. Occupied (fresh) plots stay stable; a left player's plot is
// reclaimed ONLY when a NEW wallet needs a seat and the target island has no
// truly-free plot. The client posts a heartbeat (~every 60s) to keep an active
// player's row fresh; abrupt exits simply age out after STALE_MS.
//
// `plots` schema (UNCHANGED — `updated_at` is reused as "last seen"):
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
// A plot whose `updated_at` is older than this is treated as abandoned and may
// be reclaimed by a new player. The client heartbeats well within this window.
const STALE_MS = 120_000; // ~2 minutes

type PlotRow = { wallet: string; island: number; plot: number; name: string };

// ISO timestamp of the staleness cutoff: rows with updated_at < this are stale
// (available for reclaim); rows with updated_at >= this are fresh (occupied).
function staleCutoffIso(now: number): string {
  return new Date(now - STALE_MS).toISOString();
}

// Short, human-friendly label for a wallet: first 4 + last 4 base58 chars.
function shortWallet(wallet: string): string {
  if (wallet.length <= 9) return wallet;
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

// Server-side username sanitizer — DO NOT trust the client's copy. Strips ASCII
// + C1 control characters, collapses whitespace, trims, and caps length (~16).
// Returns '' when nothing usable remains (caller falls back to shortWallet).
// Mirrors sanitizeUsername in app/src/chain/username.ts.
function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let stripped = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    const isWhitespace = /\s/.test(ch);
    if (!isWhitespace && (code <= 0x1f || (code >= 0x7f && code <= 0x9f))) continue;
    stripped += ch;
  }
  return stripped.replace(/\s+/g, ' ').trim().slice(0, 16);
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

// Read the FRESH (non-stale) plots taken on ONE island. Stale rows
// (updated_at < cutoff) are excluded, so the plots they occupy count as
// AVAILABLE (free for a new player to reclaim). `cutoffIso` is the staleness
// boundary: `updated_at=gte.<cutoff>` keeps only currently-occupied rows.
async function fetchFreshTakenPlots(
  baseUrl: string,
  serviceKey: string,
  island: number,
  cutoffIso: string,
): Promise<Set<number>> {
  const url =
    `${baseUrl}/rest/v1/plots` +
    `?island=eq.${island}` +
    `&updated_at=gte.${encodeURIComponent(cutoffIso)}` +
    `&select=plot`;
  const resp = await fetch(url, { method: 'GET', headers: authHeaders(serviceKey) });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('supabase plots scan failed', resp.status, detail);
    throw new Error('scan failed');
  }
  const rows = (await resp.json()) as Array<{ plot: number }>;
  return new Set(rows.map((r) => r.plot));
}

// Read the lowest AVAILABLE plot (0..19) on ONE specific island, or null if that
// island is full of FRESH occupants. A slot is available when no fresh row holds
// it (it may still carry a STALE row, which the caller reclaims on insert). Used
// to honour a caller's island preference so friends can land together.
async function findFreePlotOnIsland(
  baseUrl: string,
  serviceKey: string,
  island: number,
  cutoffIso: string,
): Promise<{ island: number; plot: number } | null> {
  const taken = await fetchFreshTakenPlots(baseUrl, serviceKey, island, cutoffIso);
  for (let plot = 0; plot < PLOTS_PER_ISLAND; plot++) {
    if (!taken.has(plot)) return { island, plot };
  }
  return null; // island full of fresh occupants
}

// Find the lowest AVAILABLE (island, plot): scan island 0 plots 0..19, then
// island 1, etc. Only FRESH rows count as taken, so stale-occupied slots are
// reclaimable. If an island is full of fresh occupants we advance. Bounded so a
// pathological state can't loop forever.
async function findLowestFreeSlot(
  baseUrl: string,
  serviceKey: string,
  cutoffIso: string,
): Promise<{ island: number; plot: number }> {
  // Safety ceiling: with bounded attempts upstream this is plenty of headroom.
  for (let island = 0; island < 10000; island++) {
    const taken = await fetchFreshTakenPlots(baseUrl, serviceKey, island, cutoffIso);
    for (let plot = 0; plot < PLOTS_PER_ISLAND; plot++) {
      if (!taken.has(plot)) return { island, plot };
    }
    // Island full of fresh occupants -> try the next one.
  }
  throw new Error('no free slot');
}

// HEARTBEAT / keep-alive: refresh an existing wallet's `updated_at` to now() so
// its plot stays fresh (non-stale). When `name` is non-empty and differs from
// the currently stored one, it's also applied so renames take effect mid-session
// (the client re-POSTs on rename). Best-effort — a failed refresh just means the
// row ages slightly / the rename retries next beat, so we swallow errors and
// never block returning the (still-valid) seat. Idempotent.
async function refreshExisting(
  baseUrl: string,
  serviceKey: string,
  wallet: string,
  name?: string,
): Promise<void> {
  try {
    const patch: Record<string, string> = { updated_at: new Date().toISOString() };
    if (name) patch.name = name; // caller passes a sanitized name only when it differs
    const url = `${baseUrl}/rest/v1/plots` + `?wallet=eq.${encodeURIComponent(wallet)}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: authHeaders(serviceKey, { Prefer: 'return=minimal' }),
      body: JSON.stringify(patch),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('supabase plots heartbeat failed', resp.status, detail);
    }
  } catch (err) {
    console.error('supabase plots heartbeat error', err);
  }
}

// Reclaim a stale slot: delete the row at (island, plot) ONLY if it is still
// stale (updated_at < cutoff). The guard makes this safe under races — if the
// holder heartbeated (refreshed) since we scanned, the row is fresh, the delete
// matches nothing, and the slot stays theirs (our follow-up insert then 409s and
// we retry elsewhere). A truly-free slot also matches nothing (harmless no-op).
async function reclaimStaleSlot(
  baseUrl: string,
  serviceKey: string,
  island: number,
  plot: number,
  cutoffIso: string,
): Promise<void> {
  const url =
    `${baseUrl}/rest/v1/plots` +
    `?island=eq.${island}` +
    `&plot=eq.${plot}` +
    `&updated_at=lt.${encodeURIComponent(cutoffIso)}`;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(serviceKey, { Prefer: 'return=minimal' }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('supabase plots reclaim delete failed', resp.status, detail);
    throw new Error('reclaim failed');
  }
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
  // Effective display name: a sanitized client-supplied name if usable, else the
  // short-wallet fallback. Never trust the raw body — sanitizeName guards it.
  const requestedName = sanitizeName(body.name);
  const name = requestedName || shortWallet(wallet);

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
    // Fast path / HEARTBEAT: already seated -> refresh `updated_at` (so the seat
    // stays fresh) and return the SAME assignment. Preference is ignored once a
    // wallet owns a plot, so seats stay stable and a re-POST never reassigns.
    const existing = await fetchExisting(baseUrl, serviceKey, wallet);
    if (existing) {
      // Apply a rename when a valid client name differs from the stored one;
      // otherwise just heartbeat. Either way return the EFFECTIVE name so the
      // client's label matches what peers will see.
      const rename = requestedName && requestedName !== existing.name ? requestedName : undefined;
      await refreshExisting(baseUrl, serviceKey, wallet, rename);
      const effectiveName = rename ?? existing.name;
      res.status(200).json({ island: existing.island, plot: existing.plot, name: effectiveName });
      return;
    }

    // NEW wallet: claim the lowest AVAILABLE slot (truly free OR stale). When an
    // island is preferred and not yet full of fresh occupants we target it;
    // otherwise (or once it fills) we fall back to the lowest available slot
    // across all islands. Recompute the staleness cutoff per attempt so retries
    // see freshly-aged rows. Retry on a lost UNIQUE(island, plot) race.
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const cutoffIso = staleCutoffIso(Date.now());

      let slot: { island: number; plot: number } | null = null;
      if (preferIsland !== null) {
        slot = await findFreePlotOnIsland(baseUrl, serviceKey, preferIsland, cutoffIso);
        if (!slot) preferIsland = null; // preferred island full of fresh -> stop trying it
      }
      if (!slot) slot = await findLowestFreeSlot(baseUrl, serviceKey, cutoffIso);

      // The slot is free of FRESH rows but may still carry a STALE row. Reclaim
      // it (guarded delete: only removes a row still older than the cutoff) so
      // the insert below can take the seat. No-op when the slot is truly free.
      await reclaimStaleSlot(baseUrl, serviceKey, slot.island, slot.plot, cutoffIso);

      const result = await tryClaim(baseUrl, serviceKey, {
        wallet,
        island: slot.island,
        plot: slot.plot,
        name,
      });

      if (result === 'conflict') {
        // Either our wallet got inserted by a concurrent request, OR the slot
        // was taken / its stale holder refreshed (heartbeat) before we deleted
        // it. Re-check our own row first (idempotent win), else retry the next
        // available slot.
        const now = await fetchExisting(baseUrl, serviceKey, wallet);
        if (now) {
          res.status(200).json({ island: now.island, plot: now.plot, name: now.name });
          return;
        }
        continue; // slot stolen/kept -> find the next available one
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
