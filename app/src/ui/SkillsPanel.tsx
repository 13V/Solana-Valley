import { SKILLS, skillInfo, MAX_SKILL_LEVEL } from '../game/skills';
import { useGameState } from './useGameState';

// Shows the five skills with their level, an XP progress bar, the current
// benefit and the next-level benefit. XP is earned passively by doing the
// matching activity (farming, ranching, breeding, fishing, foraging).
export function SkillsPanel({ onClose }: { onClose: () => void }) {
  const { skills } = useGameState();

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>🎯 Skills</h3>
        <span className="muted">level up by playing</span>
        <button className="x" onClick={onClose}><img className="ui-x" src="assets/sprout-ui/ui_x.png" alt="✕" /></button>
      </div>
      <div className="rows">
        {SKILLS.map((s) => {
          const xp = skills[s.id] ?? 0;
          const info = skillInfo(xp);
          const pct = Math.round(info.pct * 100);
          return (
            <div className="row" key={s.id} style={{ borderLeftColor: '#7bd66a' }}>
              <span className="upg-icon">{s.icon}</span>
              <span className="row-name">
                {s.name} <span className="lvltag">Lv {info.level}/{MAX_SKILL_LEVEL}</span>
                <span className="xpbar" style={{ display: 'block', width: '100%', margin: '4px 0' }}>
                  <span className="xpfill" style={{ width: info.max ? '100%' : `${pct}%` }} />
                </span>
                <span className="row-sub">
                  {s.desc(info.level)}
                  {!info.max && <span className="next"> → {s.desc(info.level + 1)}</span>}
                </span>
                <span className="row-sub muted">{s.blurb}</span>
              </span>
              <span className="btn sm" style={{ pointerEvents: 'none' }}>
                {info.max ? 'MAX' : `${pct}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
