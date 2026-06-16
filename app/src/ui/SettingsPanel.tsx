import { sfx } from '../game/audio';
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
