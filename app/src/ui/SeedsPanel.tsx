import { useState } from 'react';
import { PLANTS, RARITY, RARITY_ORDER, type Rarity } from '../game/economy';
import { useGameState } from './useGameState';
import { bus } from '../game/EventBus';
import { CropIcon } from './CropIcon';
import { Tooltip, PlantTipBody } from './Tooltip';
import { RarityFilterBar, matchesFilter } from './RarityFilterBar';

export function SeedsPanel({ onClose }: { onClose: () => void }) {
  const { seeds, selectedSeed, progress } = useGameState();
  const [rarity, setRarity] = useState<Rarity | 'All'>('All');
  const [q, setQ] = useState('');
  const owned = PLANTS.filter((p) => (seeds[p.id] ?? 0) > 0);
  const list = owned.filter((p) => matchesFilter(p, rarity, q));

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>🌱 Your Seeds</h3>
        <span className="muted">click to plant with the seed tool</span>
        <button className="x" onClick={onClose}><img className="ui-x" src="assets/sprout-ui/ui_x.png" alt="✕" /></button>
      </div>
      {owned.length === 0 ? (
        <p className="empty">No seeds yet — buy some at the shop.</p>
      ) : (
        <>
          {owned.length > 8 && (
            <RarityFilterBar rarity={rarity} setRarity={setRarity} q={q} setQ={setQ} rarities={RARITY_ORDER} colorOf={(r) => RARITY[r].css} />
          )}
          <div className="rows">
            {list.length === 0 && <p className="empty">No seeds match your filter.</p>}
            {list.map((p) => {
            const r = RARITY[p.rarity];
            return (
              <div className={`row ${selectedSeed === p.id ? 'sel' : ''}`} key={p.id} style={{ borderLeftColor: r.css }}>
                <span className="dot" style={{ background: r.css, color: r.css }} />
                <Tooltip content={<PlantTipBody plant={p} progress={progress} showBuy={false} />}>
                  <CropIcon id={p.id} kind="seed" />
                  <span className="row-name">
                    {p.name}
                    <span className="rarity" style={{ color: r.css }}>{p.rarity}</span>
                  </span>
                </Tooltip>
                <span className="stock">×{seeds[p.id]}</span>
                <button className="btn sm" onClick={() => bus.emit('ui:selectSeed', p.id)}>
                  {selectedSeed === p.id ? 'Selected' : 'Select'}
                </button>
              </div>
            );
          })}
          </div>
        </>
      )}
    </div>
  );
}
