import { useState } from 'react';
import { useGameState } from './useGameState';
import { masterGardenerPct } from '../game/collection';
import type { UiState } from '../game/types';
import './goals.css';

const COLLAPSED_KEY = 'solana-valley:goals-collapsed';

// A single onboarding goal: a short label plus a pure predicate over the
// latest game-state snapshot. Goals are derived entirely from state (the
// game pushes whole snapshots, so there are no granular "goal done" events).
type Goal = { label: string; done: (s: UiState) => boolean };

const GOALS: Goal[] = [
  { label: 'Get your first seed', done: (s) => Object.values(s.seeds).reduce((a, b) => a + b, 0) > 0 },
  { label: 'Harvest a crop', done: (s) => s.progress.harvested > 0 },
  { label: 'Earn 100 coins', done: (s) => s.progress.earned >= 100 },
  { label: 'Reach Level 2', done: (s) => s.progress.level >= 2 },
  { label: 'Buy a permanent upgrade', done: (s) => Object.values(s.progress.upgrades).some((lvl) => lvl > 0) },
  { label: 'Raise an animal', done: (s) => Object.values(s.animalCounts).reduce((a, b) => a + b, 0) > 0 },
  { label: 'Discover 5 plants', done: (s) => s.progress.discoveredPlants.length >= 5 },
  { label: 'Find a mutation', done: (s) => s.progress.mutationsFound > 0 },
];

// A compact, collapsible "What next?" checklist pinned to the left edge.
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

  const statuses = GOALS.map((g) => g.done(state));
  const completed = statuses.filter(Boolean).length;
  const allDone = completed === GOALS.length;

  // North-star completion meter — the rolled-up long-term goal (see Almanac for
  // the full breakdown). Derived live from the discovery/upgrade/achievement
  // state already in the snapshot.
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
            <ul className="goals-list">
              {GOALS.map((g, i) => (
                <li key={g.label} className={`goals-item${statuses[i] ? ' is-done' : ''}`}>
                  <span className="goals-mark">
                    {statuses[i] ? (
                      <img src="assets/sprout-ui/goals_check.png" alt="done" />
                    ) : (
                      <span className="goals-dot" aria-hidden="true" />
                    )}
                  </span>
                  <span className="goals-label">{g.label}</span>
                </li>
              ))}
            </ul>
            {allDone && <div className="goals-alldone">All done! 🎉</div>}
          </>
        )}
      </div>
    </div>
  );
}
