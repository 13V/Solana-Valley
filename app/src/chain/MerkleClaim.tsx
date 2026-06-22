import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { bus } from '../game/EventBus';
import { formatAmount } from './rewards';
import {
  getProgramId,
  fetchActiveClaim,
  isAlreadyClaimed,
  buildClaimTransaction,
  type ActiveClaim,
} from './merkleClaim';

// Mounted INSIDE <WalletProvider>. The TRUSTLESS (merkle) counterpart to
// RewardsClaim — when the connected wallet has an unclaimed leaf in the latest
// live on-chain distributor, this shows a small "claim on-chain" widget. The
// player's own wallet signs and submits the `claim`; no server is involved.
//
// INERT until the program is deployed: if VITE_REWARD_DISTRIBUTOR_PROGRAM isn't
// set (getProgramId() === null) the component renders nothing. Best-effort
// throughout: no wallet, no proof, an already-claimed leaf, or any RPC error
// simply hides the widget and never affects gameplay.
//
// The custodial widget (RewardsClaim) sits bottom-left at bottom:12; this one
// sits just above it (bottom:64) so the two never overlap if both are active.
// Amount decimals come from the fetched distributor (claim.decimals) so any-decimals
// mints format correctly; the $SPROUT default of 6 is carried by fetchActiveClaim.
const REWARD_SYMBOL = '$SPROUT';

export function MerkleClaim() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [claim, setClaim] = useState<ActiveClaim | null>(null);
  const [sending, setSending] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const programId = getProgramId();
    if (!programId || !publicKey) {
      if (mounted.current) setClaim(null);
      return;
    }
    const active = await fetchActiveClaim(publicKey.toBase58());
    if (!mounted.current) return;
    if (!active) {
      setClaim(null);
      return;
    }
    // Hide if this leaf has already been claimed on-chain.
    let distributor: PublicKey;
    try {
      distributor = new PublicKey(active.distributor);
    } catch {
      setClaim(null);
      return;
    }
    const claimed = await isAlreadyClaimed(connection, programId, distributor, publicKey);
    if (!mounted.current) return;
    setClaim(claimed ? null : active);
  }, [connection, publicKey]);

  // Resolve the claim on connect (and clear it on disconnect).
  useEffect(() => {
    if (!connected || !publicKey) {
      setClaim(null);
      return;
    }
    void refresh();
  }, [connected, publicKey, refresh]);

  const onClaim = useCallback(async () => {
    const programId = getProgramId();
    if (!programId || !publicKey || !claim || sending) return;
    let distributor: PublicKey;
    let mint: PublicKey;
    try {
      distributor = new PublicKey(claim.distributor);
      mint = new PublicKey(claim.mint);
    } catch {
      bus.emit('toast', 'Claim unavailable: bad distributor config');
      return;
    }

    setSending(true);
    bus.emit('toast', '🎁 Submitting your on-chain claim…');
    try {
      const tx = await buildClaimTransaction(connection, programId, {
        claimant: publicKey,
        distributor,
        mint,
        idx: claim.idx,
        amount: claim.amount,
        proof: claim.proof,
      });
      const signature = await sendTransaction(tx, connection);
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
        'confirmed',
      );
      if (!mounted.current) return;
      const amt = formatAmount(claim.amount, claim.decimals);
      bus.emit('toast', `✓ Claimed ${amt} ${REWARD_SYMBOL} on-chain!`);
    } catch (err) {
      if (mounted.current) {
        const reason = err instanceof Error ? err.message : 'transaction failed';
        bus.emit('toast', `Claim failed: ${reason}`);
      }
    } finally {
      if (mounted.current) setSending(false);
      void refresh();
    }
  }, [connection, publicKey, sendTransaction, claim, sending, refresh]);

  if (!getProgramId() || !connected || !claim) return null;

  const amountLabel = formatAmount(claim.amount, claim.decimals);

  return (
    <div
      className="merkle-claim"
      style={{
        position: 'absolute',
        left: 12,
        bottom: 64,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 10,
        background: 'rgba(20, 32, 24, 0.86)',
        border: '2px solid #f0b84a',
        boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
        pointerEvents: 'auto',
        fontFamily: 'var(--pixel-font)',
        color: '#fff5e0',
        zIndex: 30,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontSize: 11, opacity: 0.8 }}>On-chain reward</span>
        <strong style={{ fontSize: 14 }}>🎁 {amountLabel} {REWARD_SYMBOL}</strong>
      </span>
      <button
        className="btn sm"
        disabled={sending}
        title="Claim this reward to your wallet (you sign the on-chain transaction)"
        onClick={onClaim}
      >
        {sending ? 'Claiming…' : 'Claim'}
      </button>
    </div>
  );
}
