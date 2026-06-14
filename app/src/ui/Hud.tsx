import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSolBalance } from '../chain/useSolBalance';
import { useGameState, useClock } from './useGameState';
import { sfx } from '../game/audio';

// Day/night get cropped weather-sheet sprites; dawn/dusk keep their emoji
// (no clean pixel match in the pack). `emoji` doubles as the img alt text.
const PHASE_ICON: Record<string, { emoji: string; img?: string }> = {
  dawn: { emoji: '🌅' },
  day: { emoji: '☀️', img: 'assets/sprout-ui/phase_sun.png' },
  dusk: { emoji: '🌇' },
  night: { emoji: '🌙', img: 'assets/sprout-ui/phase_moon.png' },
};

export type Panel = 'shop' | 'seeds' | 'bag' | 'animals' | 'upgrades' | 'skills' | 'almanac' | 'help' | null;

// `emoji` is the original glyph (kept as img alt, or rendered as-is when no
// pixel icon exists — almanac has no clean book sprite in the pack).
const BUTTONS: Array<{ id: Exclude<Panel, null>; emoji: string; img?: string; label: string }> = [
  { id: 'shop', emoji: '🛒', img: 'assets/sprout-ui/btn_shop.png', label: 'Shop' },
  { id: 'seeds', emoji: '🌱', img: 'assets/sprout-ui/btn_seeds.png', label: 'Seeds' },
  { id: 'bag', emoji: '🎒', img: 'assets/sprout-ui/btn_bag.png', label: 'Harvest' },
  { id: 'animals', emoji: '🐔', img: 'assets/sprout-ui/icon_chicken.png', label: 'Animals' },
  { id: 'upgrades', emoji: '⬆️', img: 'assets/sprout-ui/btn_upgrades.png', label: 'Upgrades' },
  { id: 'skills', emoji: '🎯', label: 'Skills' },
  { id: 'almanac', emoji: '📖', label: 'Almanac' },
  { id: 'help', emoji: '❔', img: 'assets/sprout-ui/btn_help.png', label: 'Help' },
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
        <span className="badge">
          {PHASE_ICON[phase].img ? (
            <img className="btn-ico" src={PHASE_ICON[phase].img} alt={PHASE_ICON[phase].emoji} />
          ) : (
            PHASE_ICON[phase].emoji
          )}{' '}
          Day {day} · {clock}
        </span>
        <span className="badge coins">
          <img className="hud-icon" src="assets/sprout-ui/icon_coin.png" alt="🪙" />
          {coins.toLocaleString()}
        </span>
        <span className="badge lvl" title={`${progress.xpInto}/${progress.xpNeed} XP`}>
          <img className="hud-icon" src="assets/sprout-ui/icon_star.png" alt="⭐" /> Lv {progress.level}
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
            {b.img ? <img className="btn-ico" src={b.img} alt={b.emoji} /> : b.emoji}
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
          <img
            className="btn-ico"
            src={`assets/sprout-ui/btn_sound_${muted ? 'off' : 'on'}.png`}
            alt={muted ? '🔇' : '🔊'}
          />
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
