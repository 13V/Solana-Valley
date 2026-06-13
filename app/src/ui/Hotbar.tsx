import { HOTBAR } from '../game/constants';
import { useGameState } from './useGameState';
import { bus } from '../game/EventBus';

export function Hotbar() {
  const { selected, inventory } = useGameState();

  return (
    <div className="hotbar">
      {HOTBAR.map((slot, i) => {
        const count = slot.kind === 'seed' ? inventory[slot.id] ?? 0 : null;
        return (
          <button
            key={slot.id}
            className={`slot ${selected === slot.id ? 'selected' : ''}`}
            onClick={() => bus.emit('ui:selectTool', slot.id)}
            title={slot.label}
          >
            <span className="slot-key">{i + 1}</span>
            <span className="slot-label">{slot.label}</span>
            {count !== null && <span className="slot-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
