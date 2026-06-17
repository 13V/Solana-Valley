import { useEffect, useState } from 'react';

// Per-wallet display name ("username") store.
//
// After a player connects a Solana wallet we let them pick a friendly name that
// other players see as their in-game avatar label (instead of the shortened
// wallet address). The choice is bound to the wallet and persisted in
// localStorage so we never re-prompt once they've chosen (skipping still counts
// as a choice — we store the short-wallet default).
//
// The name round-trips to multiplayer presence via /api/join → joinIsland (see
// MultiplayerSync.tsx); this module only owns the *local* choice + reactivity.
// Mirrors useMultiplayer.ts's module-store-with-subscribers pattern so the
// prompt modal and the sync component both react to changes without prop
// drilling.

// localStorage key for a wallet's chosen username.
function storageKey(wallet: string): string {
  return `solana-valley:username:${wallet}`;
}

// Sanitize a raw username: strip control chars, collapse internal whitespace,
// trim, and cap length (~16 chars). Returns '' when nothing usable remains. The
// server (app/api/join.ts) keeps its own copy of these rules — never trust the
// client.
export function sanitizeUsername(raw: string): string {
  if (typeof raw !== 'string') return '';
  // Drop ASCII + C1 control characters (code points 0x00-0x1F, 0x7F-0x9F),
  // keeping ordinary whitespace (space/tab/newline) which is normalized below.
  let stripped = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    const isWhitespace = /\s/.test(ch);
    if (!isWhitespace && (code <= 0x1f || (code >= 0x7f && code <= 0x9f))) continue;
    stripped += ch;
  }
  // Collapse any run of whitespace to a single space, then trim the ends.
  const collapsed = stripped.replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, 16);
}

// Read the stored username for a wallet, or null if none has been chosen.
export function getUsername(wallet: string): string | null {
  try {
    const v = localStorage.getItem(storageKey(wallet));
    return v && v.length > 0 ? v : null;
  } catch {
    return null; // private mode / storage disabled -> behave as "unset"
  }
}

// Persist a wallet's username and notify subscribers. Best-effort: a storage
// failure still publishes so the in-memory hook reflects the choice this session.
export function setUsername(wallet: string, name: string): void {
  const clean = sanitizeUsername(name);
  if (!clean) return; // nothing usable -> leave the current choice untouched
  try {
    localStorage.setItem(storageKey(wallet), clean);
  } catch {
    // storage disabled -> still publish below so the session stays consistent
  }
  publish(wallet, clean);
}

// Per-wallet subscribers, so changing the name re-renders every reader for that
// wallet (the prompt closes, MultiplayerSync re-joins with the new name).
const listeners = new Map<string, Set<(name: string | null) => void>>();

function publish(wallet: string, name: string | null): void {
  listeners.get(wallet)?.forEach((l) => l(name));
}

// Subscribe a component to a wallet's username. Returns null when no wallet is
// connected or no name has been chosen yet. Re-reads on wallet change.
export function useUsername(wallet: string | null): string | null {
  const [name, setName] = useState<string | null>(() => (wallet ? getUsername(wallet) : null));

  useEffect(() => {
    if (!wallet) {
      setName(null);
      return;
    }
    setName(getUsername(wallet));
    const listener = (n: string | null) => setName(n);
    let set = listeners.get(wallet);
    if (!set) {
      set = new Set();
      listeners.set(wallet, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) listeners.delete(wallet);
    };
  }, [wallet]);

  return name;
}
