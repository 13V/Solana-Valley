import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSolBalance } from '../chain/useSolBalance';
import { useGameState, useClock } from './useGameState';

const PHASE_ICON: Record<string, string> = { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' };

export type Panel = 'shop' | 'seeds' | 'bag' | 'help' | null;

export function Hud({
  panel,
  onToggle,
}: {
  panel: Panel;
  onToggle: (p: Exclude<Panel, null>) => void;
}) {
  const { publicKey } = useWallet();
  const sol = useSolBalance();
  const { coins } = useGameState();
  const { day, clock, phase } = useClock();

  const addr = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <div className="hud">
      <div className="hud-left">
        <span className="badge">
          {PHASE_ICON[phase]} Day {day} · {clock}
        </span>
        <span className="badge coins">🪙 {coins.toLocaleString()}</span>
        <button className={`btn ${panel === 'shop' ? 'active' : ''}`} onClick={() => onToggle('shop')}>
          🛒 Shop
        </button>
        <button className={`btn ${panel === 'seeds' ? 'active' : ''}`} onClick={() => onToggle('seeds')}>
          🌱 Seeds
        </button>
        <button className={`btn ${panel === 'bag' ? 'active' : ''}`} onClick={() => onToggle('bag')}>
          🎒 Harvest
        </button>
        <button className={`btn ${panel === 'help' ? 'active' : ''}`} onClick={() => onToggle('help')}>
          ?
        </button>
      </div>
      <div className="hud-right">
        {addr && (
          <span className="badge">
            {addr}
            {sol !== null ? ` · ${sol.toFixed(2)} SOL` : ''}
          </span>
        )}
        <WalletMultiButton />
      </div>
    </div>
  );
}
