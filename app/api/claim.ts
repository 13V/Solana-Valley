import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { verifyAuth, readPostBody, getSupabaseUrl, getServiceKey } from './_auth.js';

// POST /api/claim
// Body: { wallet, message, signature }
// Pays out a wallet's claimable $SPROUT from the treasury. Custodial: the
// treasury keypair signs the transfer server-side (TREASURY_SECRET_KEY is a
// server-only secret). Two-phase against the ledger so it can't double-pay:
//   reserve_claim → <on-chain transfer> → finalize_claim (or cancel_claim on fail)
// Responds: { ok:true, signature, amount } | { ok:false, reason } | { error }
//
// Required env: SOLANA_RPC_URL, REWARD_MINT, TREASURY_SECRET_KEY (base58 64-byte
// secret key), SUPABASE_SERVICE_ROLE_KEY. See docs/REWARDS.md.

// Call a Supabase security-definer RPC with the service-role key. Returns the
// parsed scalar result. Throws on a non-2xx so the caller can react.
async function rpc(name: string, args: Record<string, unknown>, serviceKey: string): Promise<unknown> {
  const resp = await fetch(`${getSupabaseUrl()}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`rpc ${name} failed: ${resp.status} ${detail}`);
  }
  return resp.json();
}

function loadTreasury(): Keypair {
  const raw = process.env.TREASURY_SECRET_KEY;
  if (!raw) throw new Error('TREASURY_SECRET_KEY not set');
  const secret = bs58.decode(raw.trim());
  if (secret.length !== 64) throw new Error('TREASURY_SECRET_KEY must be a 64-byte base58 secret key');
  return Keypair.fromSecretKey(secret);
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
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const mintStr = process.env.REWARD_MINT;
  if (!serviceKey || !rpcUrl || !mintStr) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  let treasury: Keypair;
  let mint: PublicKey;
  let player: PublicKey;
  try {
    treasury = loadTreasury();
    mint = new PublicKey(mintStr);
    player = new PublicKey(auth.wallet);
  } catch (err) {
    console.error('claim config error', err);
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  // 1) Atomically reserve the wallet's claimable balance (base units).
  let amount: bigint;
  try {
    const reserved = await rpc('reserve_claim', { p_wallet: auth.wallet }, serviceKey);
    const n = Number(reserved);
    if (n === 0) {
      res.status(200).json({ ok: false, reason: 'nothing to claim' });
      return;
    }
    if (n < 0) {
      res.status(409).json({ ok: false, reason: 'a claim is already in progress' });
      return;
    }
    amount = BigInt(String(reserved).split('.')[0]);
  } catch (err) {
    console.error('reserve_claim error', err);
    res.status(502).json({ error: 'could not reserve claim' });
    return;
  }

  // 2) Send the tokens. Any failure here refunds the reservation (no tokens moved).
  let signature: string;
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const treasuryAta = getAssociatedTokenAddressSync(mint, treasury.publicKey);
    const playerAta = getAssociatedTokenAddressSync(mint, player);

    const tx = new Transaction();
    // Create the player's token account on first claim (treasury pays the rent).
    const playerAtaInfo = await connection.getAccountInfo(playerAta);
    if (!playerAtaInfo) {
      tx.add(createAssociatedTokenAccountInstruction(treasury.publicKey, playerAta, player, mint));
    }
    tx.add(createTransferInstruction(treasuryAta, playerAta, treasury.publicKey, amount));

    signature = await sendAndConfirmTransaction(connection, tx, [treasury]);
  } catch (err) {
    console.error('claim transfer failed; refunding reservation', err);
    try {
      await rpc('cancel_claim', { p_wallet: auth.wallet }, serviceKey);
    } catch (refundErr) {
      // Refund failed too: the amount is stuck in `pending` for operator reconciliation.
      console.error('cancel_claim failed after transfer failure', refundErr);
    }
    res.status(502).json({ error: 'token transfer failed' });
    return;
  }

  // 3) Tokens are sent — finalize the bookkeeping. If THIS fails the tokens are
  // already gone, so we must NOT refund; leave `pending` set (and the tx logged
  // here) for operator reconciliation, and still report success to the player.
  try {
    await rpc('finalize_claim', { p_wallet: auth.wallet, p_signature: signature }, serviceKey);
  } catch (err) {
    console.error('finalize_claim failed AFTER successful transfer', signature, err);
  }

  res.status(200).json({ ok: true, signature, amount: amount.toString() });
}
