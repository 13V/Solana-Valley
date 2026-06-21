import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { bus } from '../game/EventBus';
import { getWalletAuth } from './walletAuth';
import { fetchRewards, claimRewards, formatAmount, type Rewards } from './rewards';

// Mounted INSIDE <WalletProvider>. Shows a small "claim your $SPROUT" widget when
// the connected wallet has a claimable reward balance, and pays it out via
// /api/claim. Reuses the SAME once-per-session wallet signature as cloud save /
// multiplayer (getWalletAuth caches it), so claiming adds no extra prompt.
//
// Best-effort throughout: no wallet, no signature, or a network error simply
// hides the widget — it never affects gameplay.
const POLL_MS = 45_000;

export function RewardsClaim() {
  const { publicKey, signMessage, connected } = useWallet();
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [claiming, setClaiming] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!publicKey || !signMessage) return;
    const session = await getWalletAuth(publicKey, signMessage);
    if (!session) return;
    const data = await fetchRewards(session);
    if (mounted.current && data) setRewards(data);
  }, [publicKey, signMessage]);

  // Poll the ledger on connect and every POLL_MS while connected.
  useEffect(() => {
    if (!connected || !publicKey || !signMessage) {
      setRewards(null);
      return;
    }
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [connected, publicKey, signMessage, refresh]);

  const onClaim = useCallback(async () => {
    if (!publicKey || !signMessage || claiming) return;
    const session = await getWalletAuth(publicKey, signMessage);
    if (!session) {
      bus.emit('toast', 'Connect & approve your wallet to claim');
      return;
    }
    setClaiming(true);
    bus.emit('toast', '🌱 Claiming your $SPROUT…');
    const result = await claimRewards(session);
    if (!mounted.current) return;
    setClaiming(false);
    if (result.ok && rewards) {
      const amt = formatAmount(result.amount, rewards.decimals);
      bus.emit('toast', `✓ Claimed ${amt} ${rewards.symbol}!`);
    } else if (result.ok) {
      bus.emit('toast', '✓ Reward claimed!');
    } else {
      bus.emit('toast', `Claim failed: ${result.reason}`);
    }
    void refresh();
  }, [publicKey, signMessage, claiming, rewards, refresh]);

  if (!connected || !rewards) return null;
  const claimable = rewards.claimable && rewards.claimable !== '0' ? rewards.claimable : null;
  const pending = rewards.pending && rewards.pending !== '0' ? rewards.pending : null;
  // Nothing to show unless there's something to claim or a payout in flight.
  if (!claimable && !pending) return null;

  const amountLabel = claimable ? formatAmount(claimable, rewards.decimals) : formatAmount(pending!, rewards.decimals);

  return (
    <div
      className="rewards-claim"
      style={{
        position: 'absolute',
        left: 12,
        bottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 10,
        background: 'rgba(20, 32, 24, 0.86)',
        border: '2px solid #6fbf3a',
        boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
        pointerEvents: 'auto',
        fontFamily: 'var(--pixel-font)',
        color: '#eafff0',
        zIndex: 30,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontSize: 11, opacity: 0.8 }}>{claimable ? 'Claimable reward' : 'Payout processing'}</span>
        <strong style={{ fontSize: 14 }}>🌱 {amountLabel} {rewards.symbol}</strong>
      </span>
      <button
        className="btn sm"
        disabled={claiming || !claimable}
        title={claimable ? 'Send this reward to your wallet' : 'A payout is already in progress'}
        onClick={onClaim}
      >
        {claiming ? 'Claiming…' : pending && !claimable ? 'Processing…' : 'Claim'}
      </button>
    </div>
  );
}
