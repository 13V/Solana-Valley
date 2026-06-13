import { CROP_LIST } from '../game/constants';
import { useGameState } from './useGameState';
import { bus } from '../game/EventBus';

export function Shop({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { coins, inventory } = useGameState();
  if (!open) return null;

  return (
    <div className="shop">
      <div className="shop-head">
        <h3>General Store</h3>
        <button className="btn sm" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="muted">
        Coins are an off-chain placeholder for the on-chain $VALLEY SPL token (see roadmap).
      </p>
      <table>
        <thead>
          <tr>
            <th>Crop</th>
            <th>Seed</th>
            <th>Sells</th>
            <th>Have</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {CROP_LIST.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>
                {c.seedCost}🪙 · {c.daysToGrow}d
              </td>
              <td>{c.sellPrice}🪙</td>
              <td>{inventory[c.produceId] ?? 0}</td>
              <td className="shop-actions">
                <button
                  className="btn sm"
                  disabled={coins < c.seedCost}
                  onClick={() => bus.emit('ui:buySeed', c.id)}
                >
                  Buy seed
                </button>
                <button
                  className="btn sm"
                  disabled={(inventory[c.produceId] ?? 0) <= 0}
                  onClick={() => bus.emit('ui:sellCrop', c.id)}
                >
                  Sell
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
