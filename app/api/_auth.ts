// Shared server-side helpers for the Vercel serverless save/load functions.
//
// SECURITY MODEL: the browser never holds the Supabase service-role key. It
// signs a short message once per session with the connected Solana wallet; this
// module verifies that ed25519 signature here (server-side) and only then reads
// or writes Supabase using the service-role key, which lives exclusively in a
// server-only environment variable. The `saves` table has RLS enabled with no
// policies, so only the service role (which bypasses RLS) can touch it.
//
// The file name is prefixed with `_` so Vercel does not expose it as a route;
// it is imported by save.ts / load.ts.

import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Default to the project URL so the function works even if SUPABASE_URL is
// unset; the service-role key has no default and is required.
const DEFAULT_SUPABASE_URL = 'https://fqsvgqlccimrmgriretd.supabase.co';

export function getSupabaseUrl(): string {
  return (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
}

export function getServiceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// How far in the past/future a signed timestamp may be. The client signs ONCE
// per session and reuses that signature for every autosave, so this window must
// cover a play session — otherwise sync silently stops once the signature ages
// out. The signature only authorises writes to the signer's OWN save (sent over
// HTTPS), so a generous window is an acceptable trade for sign-once UX.
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export type AuthInput = {
  wallet?: unknown;
  message?: unknown;
  signature?: unknown;
};

export type AuthResult =
  | { ok: true; wallet: string }
  | { ok: false; status: number; error: string };

// UTF-8 encode identically to the browser's `new TextEncoder().encode(...)`,
// which is what the client signs. (Equivalent to tweetnacl-util's decodeUTF8,
// without pulling in an extra dependency.)
function utf8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

// Extract the first ISO-8601 timestamp present in the signed message and ensure
// it is recent. Returns an error string, or null on success.
function checkTimestamp(message: string): string | null {
  // Matches e.g. 2026-06-16T12:34:56.789Z or with +00:00 offsets.
  const match = message.match(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/,
  );
  if (!match) return 'message missing ISO timestamp';
  const ts = Date.parse(match[0]);
  if (Number.isNaN(ts)) return 'message timestamp unparseable';
  const skew = Math.abs(Date.now() - ts);
  if (skew > MAX_AGE_MS) return 'message timestamp is stale';
  return null;
}

// Verify the body's wallet/message/signature triple. On success returns the
// (validated) wallet address; on failure returns an HTTP status + safe error.
export function verifyAuth(body: AuthInput): AuthResult {
  const { wallet, message, signature } = body;

  if (!isNonEmptyString(wallet) || !isNonEmptyString(message) || !isNonEmptyString(signature)) {
    return { ok: false, status: 400, error: 'wallet, message and signature are required' };
  }

  // The message must match the exact canonical format the client signs
  // (app/src/chain/walletAuth.ts buildAuthMessage):
  //   Solana Valley\nwallet: <wallet>\nts: <ISO8601>
  // Anchoring it (instead of a loose substring) binds the signature to this
  // wallet and prevents a signature for wallet A being replayed as wallet B.
  const expected = new RegExp(
    '^Solana Valley\\nwallet: ' +
      wallet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\nts: \\d{4}-\\d{2}-\\d{2}T[0-9:.]+(?:Z|[+-]\\d{2}:\\d{2})$',
  );
  if (!expected.test(message)) {
    return { ok: false, status: 401, error: 'message format invalid' };
  }

  const tsError = checkTimestamp(message);
  if (tsError) {
    return { ok: false, status: 401, error: tsError };
  }

  let pubkey: Uint8Array;
  let sig: Uint8Array;
  try {
    // wallet (base58) IS the ed25519 public key on Solana.
    pubkey = bs58.decode(wallet);
    sig = bs58.decode(signature);
  } catch {
    return { ok: false, status: 400, error: 'wallet or signature is not valid base58' };
  }

  if (pubkey.length !== 32) {
    return { ok: false, status: 400, error: 'wallet is not a valid ed25519 public key' };
  }
  if (sig.length !== 64) {
    return { ok: false, status: 400, error: 'signature has an invalid length' };
  }

  let valid = false;
  try {
    valid = nacl.sign.detached.verify(utf8(message), sig, pubkey);
  } catch {
    return { ok: false, status: 400, error: 'signature verification failed' };
  }
  if (!valid) {
    return { ok: false, status: 401, error: 'invalid signature' };
  }

  return { ok: true, wallet };
}

// Common request-method / body guard shared by both endpoints. Returns the
// parsed body object on success, or sends a JSON error and returns null.
export function readPostBody(req: VercelRequestLike, res: VercelResponseLike): Record<string, unknown> | null {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method not allowed' });
    return null;
  }
  let body = req.body as unknown;
  // Vercel parses JSON automatically when Content-Type is application/json, but
  // be defensive in case it arrives as a raw string.
  if (typeof body === 'string') {
    try {
      body = body.length ? JSON.parse(body) : {};
    } catch {
      res.status(400).json({ error: 'invalid JSON body' });
      return null;
    }
  }
  if (typeof body !== 'object' || body === null) {
    res.status(400).json({ error: 'expected a JSON object body' });
    return null;
  }
  return body as Record<string, unknown>;
}

// Minimal structural types so this module does not need to import
// @vercel/node at the type level (save.ts/load.ts pass the real objects).
export type VercelRequestLike = {
  method?: string;
  body?: unknown;
};
export type VercelResponseLike = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
};
