import { PLANTS, RARITY, RARITY_ORDER, MUTATIONS } from '../game/economy';
import { FISH } from '../game/fishing';
import { FORAGE } from '../game/forage';
import { loreFor } from '../game/lore';
import { ACHIEVEMENTS } from '../game/progression';
import { collectionBonus, completedTiers, masterGardenerPct } from '../game/collection';
import { useGameState } from './useGameState';
import { CropIcon } from './CropIcon';
import { Tooltip, PlantTipBody } from './Tooltip';

export function AlmanacPanel({ onClose }: { onClose: () => void }) {
  const { progress } = useGameState();
  const dp = new Set(progress.discoveredPlants);
  const dm = new Set(progress.discoveredMutations);
  const ach = new Set(progress.achievements);
  const plantPct = Math.round((dp.size / PLANTS.length) * 100);
  const muts = MUTATIONS.filter((m) => m.id !== 'normal');

  // Collection-as-power: discoveries grant a permanent sale-value bonus. Master
  // Gardener % rolls every completion axis into one north-star figure. Both are
  // derived live from the discovery state already in `progress` — no extra
  // persisted state needed.
  const bonus = collectionBonus(dp, dm);
  const tiersDone = completedTiers(dp);
  const masterPct = masterGardenerPct({
    discoveredPlants: dp,
    discoveredMutations: dm,
    level: progress.level,
    upgrades: progress.upgrades,
    achievements: ach,
  });
  // Tiers that actually have plants, in ladder order, for the per-tier readout.
  const tiers = RARITY_ORDER.filter((r) => PLANTS.some((p) => p.rarity === r));

  return (
    <div className="panel almanac">
      <div className="panel-head">
        <h3>📖 Almanac</h3>
        <span className="muted">
          🌱 Master Gardener: <strong>{masterPct}%</strong> · {dp.size}/{PLANTS.length} plants · {ach.size}/{ACHIEVEMENTS.length} achievements
        </span>
        <button className="x" onClick={onClose}><img className="ui-x" src="assets/sprout-ui/ui_x.png" alt="✕" /></button>
      </div>
      <div className="alm-body">
        <div className="alm-collection">
          <h4>Collection Bonus — +{bonus.pct}% crop sale value</h4>
          <p className="muted alm-note">
            Every distinct plant (+1%) and mutation (+1%) you discover permanently boosts ALL crop
            sales — Commons included. Complete a whole rarity tier for +3% more.
          </p>
          <div className="alm-tier-grid">
            {tiers.map((r) => {
              const inTier = PLANTS.filter((p) => p.rarity === r);
              const found = inTier.filter((p) => dp.has(p.id)).length;
              const complete = tiersDone.has(r);
              const css = RARITY[r].css;
              return (
                <span
                  key={r}
                  className={`alm-tier ${complete ? 'done' : ''}`}
                  style={{ color: css, borderColor: complete ? css : '#3a4250' }}
                >
                  {complete ? '✓' : ''} {r} {found}/{inTier.length}
                </span>
              );
            })}
          </div>
          {bonus.allPlants && <p className="alm-note" style={{ color: '#ffd21a' }}>★ Full collection — finale bonus active!</p>}
        </div>

        <h4>Plants — {plantPct}% discovered</h4>
        <p className="muted alm-note">★ Crops roll quality stars that multiply their value · ♻ marks multi-harvest crops</p>
        <div className="alm-grid">
          {PLANTS.map((p) => {
            const found = dp.has(p.id);
            const r = RARITY[p.rarity];
            const regrows = typeof p.regrow === 'number' && p.regrow > 0;
            return (
              <div
                className={`alm-cell ${found ? '' : 'locked'}`}
                key={p.id}
                style={found ? { borderColor: r.css } : undefined}
              >
                {found ? (
                  <Tooltip
                    className="ui-tip-trigger col"
                    content={<PlantTipBody plant={p} progress={progress} showBuy={false} />}
                  >
                    <CropIcon id={p.id} className="crop-ico" />
                    <span className="alm-name">{p.name}</span>
                    <span className="alm-rar" style={{ color: r.css }}>{p.rarity}</span>
                    {regrows && <span className="alm-regrow">♻ Multi-harvest</span>}
                  </Tooltip>
                ) : (
                  <span className="alm-name">???</span>
                )}
              </div>
            );
          })}
        </div>

        <h4>Mutations — {dm.size}/{muts.length} found</h4>
        <div className="alm-tags">
          {muts.map((m) => {
            const found = dm.has(m.id);
            return (
              <span
                key={m.id}
                className="alm-tag"
                style={{ color: found ? m.css : '#6b7280', borderColor: found ? m.css : '#3a4250' }}
              >
                {found ? `${m.name} ×${m.mult}` : '???'}
              </span>
            );
          })}
        </div>

        <h4>Fish — Bestiary ({FISH.length})</h4>
        <div className="rows">
          {FISH.map((f) => {
            const r = RARITY[f.rarity];
            const lore = loreFor(f.id);
            return (
              <div className="row" key={f.id} style={{ borderLeftColor: r.css }}>
                <span className="row-name">
                  {f.name}
                  <span className="rarity" style={{ color: r.css }}> {f.rarity}</span>
                  {lore && (
                    <span className="row-sub muted" style={{ display: 'block', fontStyle: 'italic' }}>{lore}</span>
                  )}
                </span>
                <span className="row-meta">{f.value.toLocaleString()}🪙</span>
              </div>
            );
          })}
        </div>

        <h4>Foraging — Field Guide ({FORAGE.length})</h4>
        <div className="rows">
          {FORAGE.map((n) => {
            const lore = loreFor(n.id);
            return (
              <div className="row" key={n.id} style={{ borderLeftColor: n.css }}>
                <span className="row-name">
                  {n.name}
                  {lore && (
                    <span className="row-sub muted" style={{ display: 'block', fontStyle: 'italic' }}>{lore}</span>
                  )}
                </span>
                <span className="row-meta">{n.value.toLocaleString()}🪙</span>
              </div>
            );
          })}
        </div>

        <h4>Achievements</h4>
        <div className="rows">
          {ACHIEVEMENTS.map((a) => {
            const done = ach.has(a.id);
            return (
              <div className={`row ${done ? 'sel' : ''}`} key={a.id}>
                <span className="ach-mark">{done ? '🏆' : '🔒'}</span>
                <span className="row-name">
                  {a.name}
                  <span className="row-sub">{a.desc}</span>
                </span>
                <span className="row-meta">+{a.reward.toLocaleString()}🪙</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
