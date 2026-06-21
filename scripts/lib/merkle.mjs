// Merkle tree for the trustless reward distributor (see programs/reward-distributor
// and docs/REWARDS.md). This is the CANONICAL leaf/node hashing — the Rust program
// (claim verify), this builder, and the client claim instruction MUST all agree
// byte-for-byte, or proofs won't verify. A test vector is asserted at the bottom
// so any drift in the hashing fails loudly.
//
// Scheme (standard Solana distributor, e.g. jito/streamflow):
//   leaf = keccak256( u64le(index) ++ pubkey(32) ++ u64le(amount) )    // 48-byte preimage
//   node = keccak256( min(a,b) ++ max(a,b) )                           // sorted pair, 64-byte
//   proof = sibling hashes leaf→root; verify folds with the same sorted rule.
// Sorted-pair hashing means proofs carry no position bits, and leaves (48-byte
// preimage) can't collide with nodes (64-byte) by construction.

import { keccak_256 } from '@noble/hashes/sha3';
import bs58 from 'bs58';

// u64 little-endian, 8 bytes. Accepts number | bigint | numeric-string.
export function u64le(value) {
  let v = BigInt(value);
  if (v < 0n) throw new Error('u64le: negative');
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error('u64le: exceeds 64 bits');
  return out;
}

// Accept a pubkey as base58 string or raw 32 bytes -> Uint8Array(32).
function pubkeyBytes(pubkey) {
  const b = typeof pubkey === 'string' ? bs58.decode(pubkey) : pubkey;
  if (b.length !== 32) throw new Error('pubkey must be 32 bytes');
  return b;
}

function concat(...arrs) {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

// Lexicographic compare of two equal-ish byte arrays. <0, 0, or >0.
function cmp(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

// keccak256(min(a,b) || max(a,b)).
export function hashPair(a, b) {
  return cmp(a, b) <= 0 ? keccak_256(concat(a, b)) : keccak_256(concat(b, a));
}

// The leaf hash for one allocation. claimant: base58 string or 32 bytes.
export function leafHash(index, claimant, amount) {
  return keccak_256(concat(u64le(index), pubkeyBytes(claimant), u64le(amount)));
}

const toHex = (u8) => Buffer.from(u8).toString('hex');

/**
 * Build a merkle tree from allocations.
 * @param {{wallet: string, amount: string|bigint|number}[]} allocations
 *        (index is assigned by array position, so keep the order stable)
 * @returns {{ root: string, total: string, leaves: {index,wallet,amount,leaf}[],
 *             proofFor(index): string[] }}  root/leaf/proof hashes are hex strings.
 */
export function buildTree(allocations) {
  const leaves = allocations.map((a, index) => ({
    index,
    wallet: a.wallet,
    amount: BigInt(a.amount).toString(),
    leaf: leafHash(index, a.wallet, a.amount),
  }));
  let total = 0n;
  for (const a of allocations) total += BigInt(a.amount);

  if (leaves.length === 0) {
    return { root: '', total: '0', leaves: [], proofFor: () => [] };
  }

  // Build levels bottom-up. Odd node at a level is promoted (hashed with itself
  // would change semantics; promotion is the common, proof-friendly choice).
  const levels = [leaves.map((l) => l.leaf)];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push(i + 1 < cur.length ? hashPair(cur[i], cur[i + 1]) : cur[i]);
    }
    levels.push(next);
  }
  const root = levels[levels.length - 1][0];

  function proofFor(index) {
    const proof = [];
    let idx = index;
    for (let level = 0; level < levels.length - 1; level++) {
      const nodes = levels[level];
      const pairIdx = idx ^ 1; // sibling
      if (pairIdx < nodes.length) proof.push(toHex(nodes[pairIdx]));
      idx = Math.floor(idx / 2);
    }
    return proof;
  }

  return {
    root: toHex(root),
    total: total.toString(),
    leaves: leaves.map((l) => ({ ...l, leaf: toHex(l.leaf) })),
    proofFor,
  };
}

// Verify a proof the same way the Rust program does (sorted fold). Hex in.
export function verify(proofHex, rootHex, index, claimant, amount) {
  let computed = leafHash(index, claimant, amount);
  for (const p of proofHex) computed = hashPair(computed, Buffer.from(p, 'hex'));
  return toHex(computed) === rootHex;
}

// ---- self-test --------------------------------------------------------------
// Locks the leaf encoding with a fixed vector. If this throws, the hashing
// changed and the Rust program + client claim builder MUST be updated to match
// (the same vector is documented in programs/reward-distributor for cross-check).
export const LEAF_TEST_VECTOR = {
  index: 0,
  pubkey: '11111111111111111111111111111111', // System program id (stable, well-known)
  amount: '1000000',
  leaf: '6b51e580de79f585468ef94881739028002088fc2747567c31ca24ff72087597',
};
{
  const got = toHex(leafHash(LEAF_TEST_VECTOR.index, LEAF_TEST_VECTOR.pubkey, LEAF_TEST_VECTOR.amount));
  if (got !== LEAF_TEST_VECTOR.leaf) {
    throw new Error(`merkle leaf hashing drifted: got ${got}, expected ${LEAF_TEST_VECTOR.leaf}`);
  }
}
