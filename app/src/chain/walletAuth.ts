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

  const cached = cache.get(wallet);
  if (cached) return cached;

  const pending = inFlight.get(wallet);
  if (pending) return pending;

  const promise = (async (): Promise<WalletAuth | null> => {
    try {
      const message = buildAuthMessage(wallet);
      const sigBytes = await signMessage(new TextEncoder().encode(message));
      const signature = bs58.encode(sigBytes);
      const auth: WalletAuth = { wallet, message, signature };
      cache.set(wallet, auth);
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
  } else {
    cache.clear();
    inFlight.clear();
  }
}
