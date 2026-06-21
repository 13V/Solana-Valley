// Client-side logic for the TRUSTLESS (merkle) reward distributor — "Option B"
// in docs/REWARDS.md. Unlike the custodial path (rewards.ts / api/claim.ts), no
// server signs the payout: the player fetches their published merkle proof from
// Supabase and submits the on-chain `claim` themselves (their own wallet is the
// only signer). The treasury never holds a hot wallet of rewards; the tokens
// live in an on-chain vault PDA that only releases against a proof of the
// published root.
//
// This module is framework-agnostic (no React). The React glue lives in
// MerkleClaim.tsx. Everything is best-effort: a missing program id, a missing
// proof row, or an RPC hiccup resolves to null/false and never throws — the
// widget simply stays hidden and gameplay is untouched.
//
// The on-chain program is `reward_distributor` (Anchor 0.30.1). Its program id
// is read from VITE_REWARD_DISTRIBUTOR_PROGRAM. Until that env var points at a
// deployed program, the feature is INERT (getProgramId() returns null and the
// widget renders nothing).

import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { supabase } from './supabase';

// Anchor instruction discriminator for `claim` — sha256("global:claim")[..8].
// Hardcoded (matches the on-chain program) so we don't need the IDL at runtime.
const CLAIM_DISCRIMINATOR = Uint8Array.from([62, 198, 214, 193, 213, 159, 108, 210]);

// The wallet's resolved entitlement against the latest live distributor: the
// distributor account, the leaf's (idx, amount), and the merkle proof (hex).
export type ActiveClaim = {
  seasonId: number;
  distributor: string;
  mint: string;
  idx: number;
  amount: string; // base units (token × 10^decimals), integer string
  proof: string[]; // each element a 32-byte hash, hex-encoded
};

// Parameters for buildClaimTransaction — the resolved on-chain pubkeys/values.
export type ClaimParams = {
  claimant: PublicKey;
  distributor: PublicKey;
  mint: PublicKey;
  idx: number;
  amount: string; // base units, integer string
  proof: string[]; // hex-encoded 32-byte hashes
};

// Parse VITE_REWARD_DISTRIBUTOR_PROGRAM into a PublicKey. Returns null when the
// env var is unset or not a valid base58 pubkey, so callers can treat the whole
// feature as inert. Deliberately NOT evaluated at module top level: an invalid
// string would throw on import and take down the bundle.
export function getProgramId(): PublicKey | null {
  try {
    const raw = import.meta.env.VITE_REWARD_DISTRIBUTOR_PROGRAM;
    if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
    return new PublicKey(raw.trim());
  } catch {
    return null;
  }
}

// Decode a hex string (optionally 0x-prefixed) into a Uint8Array. Returns null
// on any malformed input so a bad proof row can't throw.
function hexToBytes(hex: string): Uint8Array | null {
  try {
    let s = hex.trim();
    if (s.startsWith('0x') || s.startsWith('0X')) s = s.slice(2);
    if (s.length === 0 || s.length % 2 !== 0) return null;
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) {
      const byte = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16);
      if (Number.isNaN(byte)) return null;
      out[i] = byte;
    }
    return out;
  } catch {
    return null;
  }
}

// Encode a u64 as 8 little-endian bytes from a decimal string (base units).
function u64le(value: string | number): Uint8Array {
  let n = BigInt(value);
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

// Encode a u32 as 4 little-endian bytes.
function u32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  let n = value >>> 0;
  for (let i = 0; i < 4; i++) {
    out[i] = n & 0xff;
    n >>>= 8;
  }
  return out;
}

// claim_status PDA: ["claim_status", distributor, claimant].
function claimStatusPda(programId: PublicKey, distributor: PublicKey, claimant: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('claim_status'), distributor.toBuffer(), claimant.toBuffer()],
    programId,
  )[0];
}

// vault PDA: ["vault", distributor].
function vaultPda(programId: PublicKey, distributor: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), distributor.toBuffer()],
    programId,
  )[0];
}

// Resolve the connected wallet's claim against the latest LIVE distributor.
// A distributor is live once its `distributor_pubkey` is set (the on-chain
// account has been created). Returns null when there's no live distributor or
// the wallet isn't in that distribution. Best-effort: never throws.
export async function fetchActiveClaim(wallet: string): Promise<ActiveClaim | null> {
  try {
    // Latest live distributor (newest season that has been deployed on-chain).
    const { data: dist, error: distErr } = await supabase
      .from('distributors')
      .select('season_id, mint, distributor_pubkey')
      .not('distributor_pubkey', 'is', null)
      .order('season_id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (distErr || !dist || !dist.distributor_pubkey || !dist.mint) return null;

    const seasonId = Number(dist.season_id);

    // This wallet's leaf in that distribution.
    const { data: row, error: rowErr } = await supabase
      .from('distributor_claims')
      .select('idx, amount, proof')
      .eq('season_id', seasonId)
      .eq('wallet', wallet)
      .maybeSingle();
    if (rowErr || !row) return null;

    const proof = Array.isArray(row.proof) ? (row.proof as unknown[]).map((p) => String(p)) : [];
    const amount = String(row.amount ?? '0');
    if (!amount || amount === '0') return null;

    return {
      seasonId,
      distributor: String(dist.distributor_pubkey),
      mint: String(dist.mint),
      idx: Number(row.idx),
      amount,
      proof,
    };
  } catch {
    return null;
  }
}

// Has this wallet already claimed against this distributor? The program creates
// the claim_status PDA on a successful claim, so its existence is the flag.
// Best-effort: an RPC error resolves to false (we'd rather show the widget and
// let the on-chain program reject a double-claim than hide a valid one).
export async function isAlreadyClaimed(
  connection: Connection,
  programId: PublicKey,
  distributor: PublicKey,
  claimant: PublicKey,
): Promise<boolean> {
  try {
    const pda = claimStatusPda(programId, distributor, claimant);
    const info = await connection.getAccountInfo(pda);
    return info != null;
  } catch {
    return false;
  }
}

// Build the (unsigned) claim transaction: derives the PDAs + the claimant's ATA,
// prepends an ATA-creation ix if the token account doesn't exist yet, then the
// hand-encoded `claim` ix. The caller signs/sends it with their wallet.
export async function buildClaimTransaction(
  connection: Connection,
  programId: PublicKey,
  params: ClaimParams,
): Promise<Transaction> {
  const { claimant, distributor, mint, idx, amount, proof } = params;

  const claimStatus = claimStatusPda(programId, distributor, claimant);
  const vault = vaultPda(programId, distributor);
  const claimantToken = getAssociatedTokenAddressSync(mint, claimant);

  const tx = new Transaction();

  // Create the claimant's ATA on first claim (the claimant pays the rent).
  const ataInfo = await connection.getAccountInfo(claimantToken).catch(() => null);
  if (!ataInfo) {
    tx.add(createAssociatedTokenAccountInstruction(claimant, claimantToken, claimant, mint));
  }

  // Instruction data: discriminator ++ index(u64 LE) ++ amount(u64 LE) ++
  // proof(Vec<[u8;32]> = u32 LE len ++ len×32 raw bytes).
  const proofBytes: Uint8Array[] = [];
  for (const el of proof) {
    const b = hexToBytes(el);
    if (!b || b.length !== 32) {
      throw new Error('invalid proof element');
    }
    proofBytes.push(b);
  }
  const head = [CLAIM_DISCRIMINATOR, u64le(idx), u64le(amount), u32le(proofBytes.length)];
  const totalLen = head.reduce((n, a) => n + a.length, 0) + proofBytes.length * 32;
  const data = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of head) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  for (const p of proofBytes) {
    data.set(p, offset);
    offset += 32;
  }

  tx.add(
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: claimant, isSigner: true, isWritable: true },
        { pubkey: distributor, isSigner: false, isWritable: true },
        { pubkey: claimStatus, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: claimantToken, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    }),
  );

  return tx;
}
