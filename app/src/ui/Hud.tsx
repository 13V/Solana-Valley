import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSolBalance } from '../chain/useSolBalance';
import { useGameState, useClock } from './useGameState';
import { sfx } from '../game/audio';

const PHASE_ICON: Record<string, string> = { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' };

export type Panel = 'shop' | 'seeds' | 'bag' | 'upgrades' | 'almanac' | 'help' | null;

const BUTTONS: Array<{ id: Exclude<Panel, null>; icon: string; label: string }> = [
  { id: 'shop', icon: '🛒', label: 'Shop' },
  { id: 'seeds', icon: '🌱', label: 'Seeds' },
  { id: 'bag', icon: '🎒', label: 'Harvest' },
  { id: 'upgrades', icon: '⬆️', label: 'Upgrades' },
  { id: 'almanac', icon: '📖', label: 'Almanac' },
  { id: 'help', icon: '❔', label: 'Help' },
];

export function Hud({
  panel,
  onToggle,
}: {
  panel: Panel;
  onToggle: (p: Exclude<Panel, null>) => void;
}) {
  const { publicKey } = useWallet();
  const sol = useSolBalance();
  const { coins, progress } = useGameState();
  const { day, clock, phase } = useClock();

  const addr = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : null;
  const xpPct = progress.xpNeed > 0 ? Math.min(100, (progress.xpInto / progress.xpNeed) * 100) : 100;
  const [muted, setMuted] = useState(() => sfx.isMuted());

  return (
    <div className="hud">
      <div className="hud-left">
        <span className="badge">{PHASE_ICON[phase]} Day {day} · {clock}</span>
        <span className="badge coins">
          <img className="hud-icon" src="/assets/sprout-ui/icon_coin.png" alt="🪙" />
          {coins.toLocaleString()}
        </span>
        <span className="badge lvl" title={`${progress.xpInto}/${progress.xpNeed} XP`}>
          <img className="hud-icon" src="/assets/sprout-ui/icon_star.png" alt="⭐" /> Lv {progress.level}
          <span className="xpbar"><span className="xpfill" style={{ width: `${xpPct}%` }} /></span>
        </span>
      </div>
      <div className="hud-buttons">
        {BUTTONS.map((b) => (
          <button
            key={b.id}
            className={`iconbtn ${panel === b.id ? 'active' : ''}`}
            onClick={() => onToggle(b.id)}
            title={b.label}
          >
            {b.icon}
          </button>
        ))}
        <button
          className="iconbtn"
          title={muted ? 'Unmute' : 'Mute'}
          onClick={() => {
            sfx.resume();
            const next = !muted;
            sfx.setMuted(next);
            setMuted(next);
          }}
        >
          {muted ? '🔇' : '🔊'}
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
