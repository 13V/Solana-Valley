import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { verifyAuth, readPostBody, getSupabaseUrl, getServiceKey } from './_auth.js';

// POST /api/claim
// Body: { wallet, message, signature }
// Pays out a wallet's claimable $LANDS from the treasury. Custodial: the treasury
// keypair signs the transfer server-side (TREASURY_SECRET_KEY is a server-only
// secret). Two-phase against the ledger so it can't double-pay:
//   reserve_claim → <on-chain transfer> → finalize_claim (success)
//                                       → cancel_claim   (ONLY if tokens didn't move)
//                                       → leave pending  (ambiguous confirmation)
// Responds: { ok:true, signature, amount } | { ok:false, reason } | { error }
//
// CRITICAL: we refund (cancel_claim) ONLY when we know the transfer did not move
// tokens — i.e. the send itself failed, or the tx confirmed with an on-chain
// error. If confirmation is AMBIGUOUS (timeout/RPC error — the tx may have
// landed), we do NOT cancel: we leave `pending` set (with the signature stamped)
// for operator reconciliation, so a landed-but-unconfirmed transfer can never be
// refunded and then paid again.
//
// Required env: SOLANA_RPC_URL, REWARD_MINT, TREASURY_SECRET_KEY (base58 64-byte
// secret key), REWARD_DECIMALS, SUPABASE_SERVICE_ROLE_KEY. See docs/REWARDS.md.

// Call a Supabase security-definer RPC with the service-role key. Returns the
// parsed result. Throws on a non-2xx so the caller can react.
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
  const decimals = Number(process.env.REWARD_DECIMALS ?? 6);
  if (!serviceKey || !rpcUrl || !mintStr || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
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

  // 1) Atomically reserve the wallet's claimable balance (base units, as a string).
  let amount: bigint;
  try {
    const reserved = await rpc('reserve_claim', { p_wallet: auth.wallet }, serviceKey);
    const reservedStr = String(reserved);
    if (reservedStr === '0') {
      res.status(200).json({ ok: false, reason: 'nothing to claim' });
      return;
    }
    if (reservedStr === '-1') {
      res.status(409).json({ ok: false, reason: 'a claim is already in progress' });
      return;
    }
    amount = BigInt(reservedStr);
    if (amount <= 0n) {
      res.status(200).json({ ok: false, reason: 'nothing to claim' });
      return;
    }
  } catch (err) {
    console.error('reserve_claim error', err);
    res.status(502).json({ error: 'could not reserve claim' });
    return;
  }

  // Helper: refund the reservation. Safe to call ONLY when tokens did not move.
  const refund = async () => {
    try {
      await rpc('cancel_claim', { p_wallet: auth.wallet }, serviceKey);
    } catch (refundErr) {
      console.error('cancel_claim failed; amount left pending for reconciliation', refundErr);
    }
  };

  // 2) Build + sign the transfer with an explicit blockhash so we can confirm by
  // signature (and reason about expiry) rather than blindly retrying.
  const connection = new Connection(rpcUrl, 'confirmed');
  let signature: string;
  let latest: Awaited<ReturnType<Connection['getLatestBlockhash']>>;
  try {
    const treasuryAta = getAssociatedTokenAddressSync(mint, treasury.publicKey);
    const playerAta = getAssociatedTokenAddressSync(mint, player);
    const tx = new Transaction();
    // Create the player's token account on first claim (treasury pays the rent).
    const playerAtaInfo = await connection.getAccountInfo(playerAta);
    if (!playerAtaInfo) {
      tx.add(createAssociatedTokenAccountInstruction(treasury.publicKey, playerAta, player, mint));
    }
    // transferChecked asserts the mint + decimals on-chain (guards a misconfig).
    tx.add(createTransferCheckedInstruction(treasuryAta, mint, playerAta, treasury.publicKey, amount, decimals));
    latest = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;
    tx.feePayer = treasury.publicKey;
    tx.sign(treasury);
    // Broadcast. If THIS throws, the tx never entered the network → no tokens
    // moved → safe to refund.
    signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
  } catch (sendErr) {
    console.error('claim send failed (not broadcast); refunding', sendErr);
    await refund();
    res.status(502).json({ error: 'token transfer failed' });
    return;
  }

  // Stamp the signature on the reserved row so a stuck pending can be reconciled.
  await rpc('stamp_claim_sig', { p_wallet: auth.wallet, p_signature: signature }, serviceKey).catch(() => {});

  // 3) Confirm. Distinguish the three outcomes:
  try {
    const conf = await connection.confirmTransaction(
      { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      'confirmed',
    );
    if (conf.value.err) {
      // Tx was processed but FAILED on-chain → tokens did not move → safe refund.
      console.error('claim tx failed on-chain; refunding', signature, conf.value.err);
      await refund();
      res.status(502).json({ error: 'token transfer failed' });
      return;
    }
  } catch (confErr) {
    // AMBIGUOUS: confirmation timed out / RPC errored. The tx MAY have landed.
    // Do NOT refund — leave `pending` (signature stamped) for reconciliation.
    console.error('claim confirmation ambiguous; left pending for reconciliation', signature, confErr);
    res.status(202).json({ ok: false, reason: 'payout processing — check back shortly', signature });
    return;
  }

  // 4) Confirmed success → finalize the bookkeeping. If finalize fails the tokens
  // are already gone, so we must NOT refund; leave pending for reconciliation.
  try {
    await rpc('finalize_claim', { p_wallet: auth.wallet, p_signature: signature }, serviceKey);
  } catch (err) {
    console.error('finalize_claim failed AFTER successful transfer', signature, err);
  }

  res.status(200).json({ ok: true, signature, amount: amount.toString() });
}
