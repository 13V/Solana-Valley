import { SKINS, skinSwatch } from '../game/skins';
import { useGameState } from './useGameState';
import { bus } from '../game/EventBus';

// Cozy coat recolours for the player's cat. Classic is free; the rest are a
// small coin sink. Selecting an unowned coat buys it (the game validates coins).
export function WardrobePanel({ onClose }: { onClose: () => void }) {
  const { coins, skin, ownedSkins } = useGameState();
  const owned = new Set(ownedSkins);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>🐾 Cat Coats</h3>
        <span className="muted">recolour your cat — cosmetic only</span>
        <button className="x" onClick={onClose}>
          <img className="ui-x" src="assets/sprout-ui/ui_x.png" alt="✕" />
        </button>
      </div>
      <div className="rows">
        {SKINS.map((s) => {
          const isOwned = owned.has(s.id);
          const isWorn = skin === s.id;
          const afford = coins >= s.cost;
          return (
            <div className={`row ${!isOwned && !afford ? 'locked' : ''}`} key={s.id}>
              <span className="skin-swatch" style={{ background: skinSwatch(s) }} />
              <span className="row-name">
                {s.name}
                <span className="row-sub">{s.desc}</span>
              </span>
              <button
                className="btn sm"
                disabled={isWorn || (!isOwned && !afford)}
                onClick={() => bus.emit('ui:selectSkin', s.id)}
              >
                {isWorn ? 'Worn ✓' : isOwned ? 'Wear' : `${s.cost.toLocaleString()}🪙`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
