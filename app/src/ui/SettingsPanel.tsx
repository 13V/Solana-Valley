import { useEffect, useState } from 'react';
import { sfx } from '../game/audio';
import {
  getKeyBinds,
  setKeyBind,
  resetKeyBinds,
  onKeyBindsChange,
  type MoveAction,
} from '../game/input';
import { useSettings, type TextSize, type Colorblind } from './settings';
import './settings.css';

const TEXT_OPTS: Array<{ id: TextSize; label: string }> = [
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Normal' },
  { id: 'lg', label: 'Large' },
];

const CB_OPTS: Array<{ id: Colorblind; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'prot', label: 'Protanopia' },
  { id: 'deut', label: 'Deuteranopia' },
  { id: 'trit', label: 'Tritanopia' },
];

// Movement actions shown in the Controls section, in WASD reading order.
const MOVE_ACTIONS: Array<{ id: MoveAction; label: string }> = [
  { id: 'up', label: 'Move up' },
  { id: 'down', label: 'Move down' },
  { id: 'left', label: 'Move left' },
  { id: 'right', label: 'Move right' },
];

// Pretty-print a stored key for the rebind button. Single chars come in already
// upper-cased; long names (Arrow*, Space, etc.) are shown a little friendlier.
const PRETTY_KEY: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ' ': 'Space',
  Spacebar: 'Space',
};
function keyLabel(key: string): string {
  return PRETTY_KEY[key] ?? key;
}

// Modifier keys can't be bound on their own (they'd swallow real shortcuts).
const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'OS',
  'AltGraph',
]);

// Accessibility / presentation settings. Every control persists to localStorage
// and applies immediately (via useSettings → applySettings), and on page load
// (settings.ts self-applies on import).
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, update] = useSettings();

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>⚙️ Settings</h3>
        <span className="muted">accessibility & sound · saved automatically</span>
        <button className="x" onClick={onClose}>
          <img className="ui-x" src="assets/sprout-ui/ui_x.png" alt="✕" />
        </button>
      </div>
      <div className="rows settings-rows">
        {/* Sound volume */}
        <div className="row set-row" style={{ borderLeftColor: '#7bd66a' }}>
          <span className="set-label">
            Sound volume
            <span className="set-sub">effects loudness</span>
          </span>
          <div className="set-volume">
            <input
              className="set-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(settings.volume * 100)}
              aria-label="Sound volume"
              onChange={(e) => {
                sfx.resume();
                update({ volume: Number(e.target.value) / 100 });
              }}
            />
            <span className="set-vol-val">{Math.round(settings.volume * 100)}%</span>
          </div>
        </div>

        {/* Sound on/off (green check = sound enabled, i.e. not muted) */}
        <div className="row set-row" style={{ borderLeftColor: '#7bd66a' }}>
          <span className="set-label">
            Sound
            <span className="set-sub">all game sounds</span>
          </span>
          <div className="set-control">
            <Toggle
              on={!settings.muted}
              onLabel="On"
              offLabel="Off"
              ariaLabel="Toggle sound"
              onToggle={() => {
                sfx.resume();
                update({ muted: !settings.muted });
              }}
            />
          </div>
        </div>

        {/* Lofi background music (own volume + on/off, under the master Sound) */}
        <MusicControls />

        {/* Reduced motion */}
        <div className="row set-row" style={{ borderLeftColor: '#7bd66a' }}>
          <span className="set-label">
            Reduced motion
            <span className="set-sub">minimize animations</span>
          </span>
          <div className="set-control">
            <Toggle
              on={settings.reduceMotion}
              onLabel="On"
              offLabel="Off"
              ariaLabel="Reduced motion"
              onToggle={() => update({ reduceMotion: !settings.reduceMotion })}
            />
          </div>
        </div>

        {/* Text size */}
        <div className="row set-row" style={{ borderLeftColor: '#7bd66a' }}>
          <span className="set-label">
            Text size
            <span className="set-sub">UI font scale</span>
          </span>
          <div className="set-control set-seg">
            {TEXT_OPTS.map((o) => (
              <button
                key={o.id}
                className={`btn sm set-opt ${settings.textSize === o.id ? 'sel' : ''}`}
                onClick={() => update({ textSize: o.id })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Colorblind mode */}
        <div className="row set-row" style={{ borderLeftColor: '#7bd66a' }}>
          <span className="set-label">
            Colorblind mode
            <span className="set-sub">color-vision filter</span>
          </span>
          <div className="set-control set-seg">
            {CB_OPTS.map((o) => (
              <button
                key={o.id}
                className={`btn sm set-opt ${settings.colorblind === o.id ? 'sel' : ''}`}
                onClick={() => update({ colorblind: o.id })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Crop withering — ripe crops wilt (lose value) if left too long. */}
        <div className="row set-row" style={{ borderLeftColor: '#7bd66a' }}>
          <span className="set-label">
            Crop withering
            <span className="set-sub">ripe crops wilt if left too long</span>
          </span>
          <div className="set-control">
            <Toggle
              on={settings.cropWither}
              onLabel="On"
              offLabel="Off"
              ariaLabel="Crop withering"
              onToggle={() => update({ cropWither: !settings.cropWither })}
            />
          </div>
        </div>

        {/* Controls — remap the movement keys (desktop). Arrow keys always work. */}
        <Controls />
      </div>
    </div>
  );
}

// Lofi background music — its own volume + on/off, layered under the master
// Sound volume/mute. State lives in the audio engine (persisted there).
function MusicControls() {
  const [vol, setVol] = useState(() => sfx.getMusicVolume());
  const [on, setOn] = useState(() => sfx.isMusicOn());
  return (
    <>
      <div className="row set-row" style={{ borderLeftColor: '#7bd66a' }}>
        <span className="set-label">
          Music volume
          <span className="set-sub">lofi background</span>
        </span>
        <div className="set-volume">
          <input
            className="set-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(vol * 100)}
            aria-label="Music volume"
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              sfx.resume();
              sfx.setMusicVolume(v);
              if (on) sfx.startMusic();
              setVol(v);
            }}
          />
          <span className="set-vol-val">{Math.round(vol * 100)}%</span>
        </div>
      </div>
      <div className="row set-row" style={{ borderLeftColor: '#7bd66a' }}>
        <span className="set-label">
          Music
          <span className="set-sub">lofi background loop</span>
        </span>
        <div className="set-control">
          <Toggle
            on={on}
            onLabel="On"
            offLabel="Off"
            ariaLabel="Toggle music"
            onToggle={() => {
              const next = !on;
              sfx.resume();
              if (next) sfx.startMusic();
              else sfx.stopMusic();
              setOn(next);
            }}
          />
        </div>
      </div>
    </>
  );
}

// Keybind remapping for the 4 movement actions. Click a key button to enter
// "press a key…" capture mode; the next keydown rebinds it (Escape cancels,
// modifier-only keys ignored). Arrow keys remain hard-wired in the input module,
// so this only customises the primary (WASD-style) bindings.
function Controls() {
  // Bump on every keybind change so the displayed keys stay fresh; we read
  // getKeyBinds() fresh each render rather than mirroring it into state.
  const [, setVersion] = useState(0);
  const [capturing, setCapturing] = useState<MoveAction | null>(null);

  useEffect(() => onKeyBindsChange(() => setVersion((v) => v + 1)), []);

  // While capturing, the next keydown sets (or cancels) the binding. Capture in
  // the capture phase and stop propagation so the game doesn't also act on it.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(null);
        return;
      }
      if (MODIFIER_KEYS.has(e.key)) return; // wait for a real key
      setKeyBind(capturing, e.key.length === 1 ? e.key.toUpperCase() : e.key);
      sfx.resume();
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [capturing]);

  const binds = getKeyBinds();

  return (
    <div className="row set-row set-controls" style={{ borderLeftColor: '#7bd66a' }}>
      <span className="set-label">
        Controls
        <span className="set-sub">click a key, then press a new one · arrow keys always work</span>
      </span>
      <div className="set-control set-keys">
        {MOVE_ACTIONS.map((a) => (
          <button
            key={a.id}
            className={`btn sm set-key ${capturing === a.id ? 'capturing' : ''}`}
            aria-label={`${a.label}: ${capturing === a.id ? 'press a key' : keyLabel(binds[a.id])}`}
            title={`Rebind ${a.label}`}
            onClick={() => setCapturing((cur) => (cur === a.id ? null : a.id))}
          >
            <span className="set-key-act">{a.label}</span>
            <span className="set-key-cap">
              {capturing === a.id ? 'press a key…' : keyLabel(binds[a.id])}
            </span>
          </button>
        ))}
        <button
          className="btn sm set-key-reset"
          onClick={() => {
            resetKeyBinds();
            setCapturing(null);
            sfx.resume();
          }}
        >
          Reset to WASD
        </button>
      </div>
    </div>
  );
}

// A labeled on/off toggle rendered with the pack's check / X sprites.
function Toggle({
  on,
  onLabel,
  offLabel,
  ariaLabel,
  onToggle,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  ariaLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      className="set-toggle"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={ariaLabel}
      title={on ? onLabel : offLabel}
    >
      <img
        className="set-toggle-ico"
        src={`assets/sprout-ui/${on ? 'set_on' : 'set_off'}.png`}
        alt={on ? '✓' : '✕'}
      />
      <span className="set-toggle-state">{on ? onLabel : offLabel}</span>
    </button>
  );
}
