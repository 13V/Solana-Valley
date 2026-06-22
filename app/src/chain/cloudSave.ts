// Client-side cloud-save logic (framework-agnostic; the React glue lives in
// CloudSaveSync.tsx).
//
// SECURITY: the browser never sees the Supabase service key. We sign one short
// message per session with the connected wallet and send {wallet, message,
// signature} to our own /api/load and /api/save serverless functions, which
// verify the ed25519 signature server-side and talk to Supabase with the
// service-role key. Cloud save is strictly best-effort on top of localStorage —
// any network/signing failure must never break gameplay.

import { buildAuthMessage, type WalletAuth } from './walletAuth';

// Must match SAVE_KEY in app/src/game/scenes/FarmScene.ts (the localStorage key
// the game reads/writes). Kept in sync manually since that const isn't exported.
export const SAVE_KEY = 'farm-lands:save';

// sessionStorage guard so a cloud->local restore that triggers location.reload()
// can't loop forever within one tab session.
const RELOAD_GUARD_KEY = 'farm-lands:cloud-reloaded';

// A signed auth triple. Structurally identical to (and aliased from) the shared
// WalletAuth so cloud-save and multiplayer can pass the SAME signed session
// through — the user only ever signs once per wallet.
export type SignedSession = WalletAuth;

export type LoadResponse = {
  data: unknown | null;
  updated_at: string | null;
};

// Build the canonical message the wallet signs. Delegates to the shared
// walletAuth helper so cloud-save and multiplayer sign the exact same message
// (single signature prompt). Kept as a named export for existing callers.
export function buildSignMessage(wallet: string, now: Date = new Date()): string {
  return buildAuthMessage(wallet, now);
}

// Read the game's current local save as a raw JSON string (or null).
export function readLocalSaveRaw(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

// Stable stringify by re-parsing then JSON.stringify so two structurally-equal
// saves compare equal regardless of key order / formatting differences.
function normalizeJson(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

// True when the cloud save differs from what's already in localStorage. Used to
// decide whether a restore + reload is actually needed (avoids reload loops).
export function cloudDiffersFromLocal(cloudData: unknown): boolean {
  const cloud = normalizeJson(cloudData);
  if (cloud === null) return false; // unserializable -> treat as no-op
  const localRaw = readLocalSaveRaw();
  if (localRaw === null) return true; // no local save -> cloud is new
  // Re-normalize the local string through parse->stringify for a fair compare.
  let localNorm: string | null;
  try {
    localNorm = JSON.stringify(JSON.parse(localRaw));
  } catch {
    localNorm = localRaw;
  }
  return cloud !== localNorm;
}

// Apply cloud data to localStorage and reload so the game boots from it. Guarded
// by a sessionStorage flag so it happens at most once per tab session.
export function applyCloudSaveAndReload(cloudData: unknown): boolean {
  if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return false;
  if (!cloudDiffersFromLocal(cloudData)) return false;
  const json = normalizeJson(cloudData);
  if (json === null) return false;
  try {
    localStorage.setItem(SAVE_KEY, json);
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
  } catch {
    return false;
  }
  // Reload so FarmScene re-reads localStorage on boot.
  location.reload();
  return true;
}

// POST helper that always resolves (never throws) so callers stay best-effort.
async function postJson(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

// Fetch the cloud save for a signed session. Returns null on any failure.
export async function loadCloudSave(session: SignedSession): Promise<LoadResponse | null> {
  const resp = await postJson('/api/load', session);
  if (!resp || !resp.ok) return null;
  try {
    return (await resp.json()) as LoadResponse;
  } catch {
    return null;
  }
}

// Upsert the cloud save for a signed session. Returns true on success.
export async function saveCloudSave(session: SignedSession, data: unknown): Promise<boolean> {
  const resp = await postJson('/api/save', { ...session, data });
  return !!resp && resp.ok;
}
