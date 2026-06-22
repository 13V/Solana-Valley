import { useState } from 'react';
import { useGameState } from './useGameState';
import { masterGardenerPct } from '../game/collection';
import { GOALS, GOAL_MILESTONES, goalStatsFromUi, rewardLabel } from '../game/goals';
import { PLANT_BY_ID, RARITY } from '../game/economy';
import './goals.css';

const COLLAPSED_KEY = 'solana-valley:goals-collapsed';

// A compact, collapsible "What next?" questline pinned to the left edge. The
// goal ladder + rewards live in game/goals.ts; the game grants the rewards
// authoritatively and reports claimed ids in state.goalsClaimed, so this panel
// just renders the shared list. Earlier rungs are easy; later ones are long
// grinds with much bigger payouts.
export function GoalsHud() {
  const state = useGameState();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (saved !== null) return saved === '1';
    // First run (no saved preference): start collapsed on small screens so the
    // checklist is a compact pill instead of a tall panel hogging the limited
    // mobile real estate. Desktop starts expanded.
    return typeof window !== 'undefined'
      && window.matchMedia?.('(max-width: 640px)').matches;
  });

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  };

  const stats = goalStatsFromUi(state);
  const claimed = new Set(state.goalsClaimed);
  // A goal reads as done once it's been claimed (authoritative) or its predicate
  // is already satisfied (the reward lands on the next action a beat later).
  const statuses = GOALS.map((g) => claimed.has(g.id) || g.test(stats));
  const completed = statuses.filter(Boolean).length;
  const allDone = completed === GOALS.length;
  // With a long ladder (50+ rungs), only surface the next few actionable goals.
  const upcoming = GOALS.filter((g) => !(claimed.has(g.id) || g.test(stats)));
  const shown = upcoming.slice(0, 6);
  // Next goal-set milestone (every 10 goals → a guaranteed Divine+ seed).
  const nextMs = GOAL_MILESTONES.find((m) => completed < m.count);
  const nextMsSeed = nextMs ? PLANT_BY_ID[nextMs.seed.id] : undefined;

  // North-star completion meter — the rolled-up long-term goal (see Almanac for
  // the full breakdown).
  const masterPct = masterGardenerPct({
    discoveredPlants: state.progress.discoveredPlants,
    discoveredMutations: state.progress.discoveredMutations,
    level: state.progress.level,
    upgrades: state.progress.upgrades,
    achievements: state.progress.achievements,
  });

  return (
    <div className={`goals-hud${collapsed ? ' is-collapsed' : ''}`}>
      <div className="goals-inner">
        <button
          type="button"
          className="goals-head"
          onClick={toggle}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show goals' : 'Hide goals'}
        >
          <span className="goals-title">
            Goals <span className="goals-count">({completed}/{GOALS.length})</span>
          </span>
          <span className="goals-caret" aria-hidden="true">▾</span>
        </button>

        {!collapsed && (
          <>
            <div className="goals-master">🌱 Master Gardener: {masterPct}%</div>
            {nextMs && (
              <div className="goals-master" style={{ opacity: 0.92 }}>
                🎁 {nextMs.count - completed} more {nextMs.count - completed === 1 ? 'goal' : 'goals'} → a{' '}
                <strong style={{ color: nextMsSeed ? RARITY[nextMsSeed.rarity].css : undefined }}>
                  {nextMsSeed ? nextMsSeed.rarity : 'rare'}
                </strong>{' '}
                seed
              </div>
            )}
            <ul className="goals-list">
              {shown.map((g) => (
                <li key={g.id} className="goals-item">
                  <span className="goals-mark">
                    <span className="goals-dot" aria-hidden="true" />
                  </span>
                  <span className="goals-text">
                    <span className="goals-label">{g.label}</span>
                    <span className="goals-reward">{rewardLabel(g.reward)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {upcoming.length > shown.length && (
              <div className="goals-more muted">+{upcoming.length - shown.length} more goals to chase…</div>
            )}
            {allDone && <div className="goals-alldone">All goals cleared! 🎉</div>}
          </>
        )}
      </div>
    </div>
  );
}
