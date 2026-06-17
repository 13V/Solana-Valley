import { UPGRADES, upgradeUnlocked, chosenFork, type UpgradeId } from '../game/progression';
import { useGameState } from './useGameState';
import { bus } from '../game/EventBus';

export function UpgradesPanel({ onClose }: { onClose: () => void }) {
  const { coins, progress, upgradeForks } = useGameState();
  const up = progress.upgrades;
  const level = progress.level;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>⬆️ Upgrades</h3>
        <span className="muted">permanent boosts</span>
        <button className="x" onClick={onClose}><img className="ui-x" src="assets/sprout-ui/ui_x.png" alt="✕" /></button>
      </div>
      <div className="rows">
        {/* Garden Expansion: a plain, escalating coin sink that widens the
            farmable crop bed by one column at a time (capped server-side). */}
        {(() => {
          const exp = progress.plotExpansion ?? 0;
          const expMax = progress.plotExpansionMax ?? 0;
          const expCost = progress.plotExpansionCost ?? 0;
          const expMaxed = exp >= expMax;
          const expAfford = coins >= expCost;
          return (
            <div className="row" key="garden-expansion" style={{ borderLeftColor: '#7bd66a' }}>
              <span className="row-name" style={{ flex: 1 }}>
                🌱 Garden Expansion <span className="lvltag">{exp}/{expMax} cols</span>
                <span className="row-sub">
                  Widen your crop bed by one column.
                  {!expMaxed && <span className="next"> → {exp + 1}/{expMax} columns</span>}
                </span>
              </span>
              <button
                className="btn sm"
                disabled={expMaxed || !expAfford}
                onClick={() => bus.emit('ui:buyExpansion', undefined)}
              >
                {expMaxed ? 'MAX' : `${expCost.toLocaleString()}🪙`}
              </button>
            </div>
          );
        })()}
        {UPGRADES.map((u) => {
          const lvl = up[u.id] ?? 0;
          const maxed = lvl >= u.max;
          const locked = !upgradeUnlocked(u, level);
          const cost = maxed ? 0 : u.cost(lvl);
          const afford = coins >= cost;
          // At MAX, a fork-able upgrade offers a one-time 1-of-2 specialization
          // (mirrors the Skills panel's milestone perk choice).
          const fork = maxed ? chosenFork(u.id as UpgradeId, upgradeForks) : null;
          return (
            <div className="row" key={u.id} style={{ borderLeftColor: '#7bd66a', flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <img className="upg-icon-img" src={u.icon} alt="" />
                <span className="row-name" style={{ flex: 1 }}>
                  {u.name} <span className="lvltag">Lv {lvl}/{u.max}</span>
                  <span className="row-sub">
                    {u.desc(lvl)}
                    {!maxed && <span className="next"> → {u.desc(lvl + 1)}</span>}
                  </span>
                </span>
                <button
                  className="btn sm"
                  disabled={maxed || locked || !afford}
                  onClick={() => bus.emit('ui:buyUpgrade', u.id)}
                >
                  {maxed ? 'MAX' : locked ? `🔒 Lv ${u.req}` : `${cost.toLocaleString()}🪙`}
                </button>
              </div>

              {/* MAX specialization fork (1-of-2). Shown only once the upgrade is maxed. */}
              {maxed && u.fork && (
                <div style={{ marginTop: 6 }}>
                  {fork ? (
                    <span
                      className="row-sub"
                      style={{ display: 'block', color: '#2f7d2e', fontWeight: 700, borderLeft: '3px solid #2f7d2e', paddingLeft: 6 }}
                    >
                      ✓ <b>{fork.name}</b> — {fork.desc}
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="row-sub" style={{ color: '#9a6a10', fontWeight: 700 }}>★ Specialize — choose one:</span>
                      {[u.fork.a, u.fork.b].map((f) => (
                        <button
                          key={f.id}
                          className="btn sm"
                          style={{ textAlign: 'left', whiteSpace: 'normal' }}
                          onClick={() => bus.emit('ui:chooseUpgradeFork', { id: u.id, fork: f.id })}
                        >
                          <b>{f.name}</b> — {f.desc}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
