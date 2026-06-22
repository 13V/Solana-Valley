// Shared "sign once per session" wallet-auth helper.
//
// Both cloud-save AND multiplayer need to prove ownership of a Solana wallet to
// our serverless endpoints (/api/save, /api/load, /api/join). To avoid prompting
// the user for a signature twice, they both go through `getWalletAuth`, which
// signs a single canonical message per wallet and caches the result for the rest
// of the tab session.
//
// SECURITY / SERVER CONTRACT: the signed message must contain (a) the wallet
// address and (b) a fresh ISO-8601 timestamp. The server (app/api/_auth.ts)
// verifies the ed25519 signature, checks `message.includes(wallet)`, and rejects
// timestamps older than 24h. Keep MESSAGE_PREFIX/format in sync with that check.
import bs58 from 'bs58';

// Result of a successful sign. `signature` is base58-encoded (matching what the
// server decodes with bs58). Shape is intentionally compatible with cloudSave's
// SignedSession so callers can pass it straight through.
export type WalletAuth = {
  wallet: string;
  message: string;
  signature: string; // base58
};

// signMessage as exposed by @solana/wallet-adapter-react's useWallet(). It may be
// undefined when the connected wallet doesn't support message signing.
export type SignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;

const MESSAGE_PREFIX = 'Solana Valley';

// Build the canonical message the wallet signs. Embeds the wallet address and a
// fresh ISO timestamp so the server can bind the signature to this wallet and
// reject stale replays. Must satisfy app/api/_auth.ts (wallet substring + ISO
// timestamp <= 24h old).
export function buildAuthMessage(wallet: string, now: Date = new Date()): string {
  return `${MESSAGE_PREFIX}\nwallet: ${wallet}\nts: ${now.toISOString()}`;
}

// Per-tab cache of the signed auth, keyed by wallet address, so switching wallets
// re-signs but the same wallet only signs once. A module-level Map persists for
// the lifetime of the page (which is the lifetime of a "session" here).
const cache = new Map<string, WalletAuth>();

// localStorage key for a wallet's persisted auth, so a page refresh reuses an
// existing valid signature instead of re-prompting the SAME user on their own
// device. Server verification is unchanged — a stale stored sig is simply not
// reused (it would be rejected anyway).
const storageKey = (wallet: string) => `solana-valley:auth:${wallet}`;

// Server accepts signatures up to 24h old; leave ~1h of margin so a reused sig
// doesn't age out mid-request. Below this, treat a stored auth as expired.
const AUTH_TTL_MS = 23 * 60 * 60 * 1000;

// Pull the embedded ISO `ts:` out of a signed message and return its epoch ms,
// or null if absent/unparseable. Matches the format from buildAuthMessage and
// the server's timestamp check in app/api/_auth.ts.
function authTimestampMs(message: string): number | null {
  const match = message.match(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/,
  );
  if (!match) return null;
  const ts = Date.parse(match[0]);
  return Number.isNaN(ts) ? null : ts;
}

// True while a stored auth is still inside the (margined) 24h server window.
function isAuthFresh(auth: WalletAuth): boolean {
  const ts = authTimestampMs(auth.message);
  if (ts === null) return false;
  return Date.now() - ts < AUTH_TTL_MS;
}

// Read a persisted auth for `wallet` from localStorage. Returns null if absent,
// malformed, or stale. All access is guarded — storage may be unavailable.
function loadStoredAuth(wallet: string): WalletAuth | null {
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WalletAuth>;
    if (
      parsed?.wallet !== wallet ||
      typeof parsed.message !== 'string' ||
      typeof parsed.signature !== 'string'
    ) {
      return null;
    }
    const auth: WalletAuth = { wallet, message: parsed.message, signature: parsed.signature };
    return isAuthFresh(auth) ? auth : null;
  } catch {
    return null;
  }
}

// Persist a freshly-signed auth so a refresh reuses it within the valid window.
function storeAuth(auth: WalletAuth): void {
  try {
    localStorage.setItem(storageKey(auth.wallet), JSON.stringify(auth));
  } catch {
    // storage may be unavailable (private mode); the in-memory cache still works
  }
}

// In-flight signing promises, keyed by wallet, so concurrent callers (cloud-save
// + multiplayer mounting together) share a SINGLE signature prompt instead of
// racing two wallet popups.
const inFlight = new Map<string, Promise<WalletAuth | null>>();

// Acquire (or reuse) a signed auth for `publicKey`. Returns null if the wallet
// can't sign (no signMessage) or the user rejects — callers must treat that as
// "feature unavailable", never as a fatal error.
export async function getWalletAuth(
  publicKey: { toBase58(): string } | null | undefined,
  signMessage: SignMessageFn | undefined,
): Promise<WalletAuth | null> {
  if (!publicKey || !signMessage) return null;
  const wallet = publicKey.toBase58();

  // In-memory cache (this tab), then localStorage (survives a refresh) — reuse a
  // stored auth only while it's still within the server's valid window.
  const cached = cache.get(wallet);
  if (cached && isAuthFresh(cached)) return cached;

  const stored = loadStoredAuth(wallet);
  if (stored) {
    cache.set(wallet, stored);
    return stored;
  }

  const pending = inFlight.get(wallet);
  if (pending) return pending;

  const promise = (async (): Promise<WalletAuth | null> => {
    try {
      const message = buildAuthMessage(wallet);
      const sigBytes = await signMessage(new TextEncoder().encode(message));
      const signature = bs58.encode(sigBytes);
      const auth: WalletAuth = { wallet, message, signature };
      cache.set(wallet, auth);
      storeAuth(auth); // write through so a refresh reuses it within 24h
      return auth;
    } catch {
      // User rejected the prompt or the wallet errored: disable gracefully.
      return null;
    } finally {
      inFlight.delete(wallet);
    }
  })();

  inFlight.set(wallet, promise);
  return promise;
}

// Drop any cached auth (e.g. on disconnect) so a future connect re-signs. With
// no argument, clears every cached wallet.
export function clearWalletAuth(wallet?: string): void {
  if (wallet) {
    cache.delete(wallet);
    inFlight.delete(wallet);
    try { localStorage.removeItem(storageKey(wallet)); } catch { /* ignore */ }
  } else {
    // Clear every persisted auth too, not just the in-memory caches.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('solana-valley:auth:')) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }
    cache.clear();
    inFlight.clear();
  }
}
