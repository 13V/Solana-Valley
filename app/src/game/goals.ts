// =====================================================================
// PROGRESSIVE GOAL LADDER (rewarded "What next?" questline)
// ---------------------------------------------------------------------
// An ORDERED chain of goals that scales from trivial first steps to
// long-term grinds, each handing out an escalating reward (coins + global
// XP, and a seed packet on a few milestones). The game (FarmScene) owns
// the authoritative granting — it auto-claims a goal once exactly, the
// moment its predicate passes — and the GoalsHud renders the same list so
// the checklist and the rewards never drift apart.
//
// Goals are evaluated over a small `GoalStats` snapshot so the predicates
// are pure and shared by both the game (built from its private fields) and
// the UI (built from the UiState snapshot via `goalStatsFromUi`).
// =====================================================================
import type { UiState } from './types';

// The minimal stat snapshot every goal predicate reads.
export type GoalStats = {
  seedsOwned: number; // total seed packets held
  harvested: number; // lifetime crops harvested
  earned: number; // lifetime coins earned (from sales — not reward payouts)
  level: number; // global level
  upgradesBought: number; // number of distinct permanent upgrades at Lv>0
  animalsOwned: number; // total animals raised
  plantsDiscovered: number; // distinct plant species seen
  mutationsFound: number; // lifetime mutations found
};

// What completing a goal pays out. `seed` is optional and only granted if the
// plant id still exists in the economy (guarded in FarmScene).
export type GoalReward = {
  coins: number;
  xp: number;
  seed?: { id: string; count: number };
};

export type Goal = {
  id: string;
  label: string;
  test: (s: GoalStats) => boolean;
  reward: GoalReward;
};

// The ladder, easiest → hardest. Rewards climb super-linearly so each rung
// feels meaningfully bigger than the last.
export const GOALS: Goal[] = [
  { id: 'seed', label: 'Get your first seed', test: (s) => s.seedsOwned > 0, reward: { coins: 25, xp: 5 } },
  { id: 'harvest1', label: 'Harvest your first crop', test: (s) => s.harvested >= 1, reward: { coins: 50, xp: 10 } },
  { id: 'coin100', label: 'Earn 100 coins', test: (s) => s.earned >= 100, reward: { coins: 75, xp: 15 } },
  { id: 'lvl2', label: 'Reach Level 2', test: (s) => s.level >= 2, reward: { coins: 100, xp: 20, seed: { id: 'tomato', count: 3 } } },
  { id: 'upgrade1', label: 'Buy a permanent upgrade', test: (s) => s.upgradesBought >= 1, reward: { coins: 150, xp: 25 } },
  { id: 'animal1', label: 'Raise an animal', test: (s) => s.animalsOwned >= 1, reward: { coins: 200, xp: 30 } },
  { id: 'disc5', label: 'Discover 5 plants', test: (s) => s.plantsDiscovered >= 5, reward: { coins: 300, xp: 40, seed: { id: 'beet', count: 2 } } },
  { id: 'mut1', label: 'Find a mutation', test: (s) => s.mutationsFound >= 1, reward: { coins: 400, xp: 50 } },
  { id: 'harvest25', label: 'Harvest 25 crops', test: (s) => s.harvested >= 25, reward: { coins: 600, xp: 70 } },
  { id: 'lvl5', label: 'Reach Level 5', test: (s) => s.level >= 5, reward: { coins: 900, xp: 90, seed: { id: 'corn', count: 2 } } },
  { id: 'coin2k', label: 'Earn 2,000 coins', test: (s) => s.earned >= 2000, reward: { coins: 1200, xp: 120 } },
  { id: 'animal5', label: 'Raise 5 animals', test: (s) => s.animalsOwned >= 5, reward: { coins: 1600, xp: 150 } },
  { id: 'disc12', label: 'Discover 12 plants', test: (s) => s.plantsDiscovered >= 12, reward: { coins: 2200, xp: 200 } },
  { id: 'lvl10', label: 'Reach Level 10', test: (s) => s.level >= 10, reward: { coins: 3500, xp: 300, seed: { id: 'pumpkin', count: 2 } } },
  { id: 'mut5', label: 'Find 5 mutations', test: (s) => s.mutationsFound >= 5, reward: { coins: 5000, xp: 400 } },
  { id: 'harvest200', label: 'Harvest 200 crops', test: (s) => s.harvested >= 200, reward: { coins: 7000, xp: 500 } },
  { id: 'coin25k', label: 'Earn 25,000 coins', test: (s) => s.earned >= 25000, reward: { coins: 10000, xp: 700 } },
  { id: 'lvl20', label: 'Reach Level 20', test: (s) => s.level >= 20, reward: { coins: 20000, xp: 1000, seed: { id: 'starfruit', count: 1 } } },
];

// Build the predicate snapshot from the UI state the game pushes up.
export function goalStatsFromUi(s: UiState): GoalStats {
  return {
    seedsOwned: Object.values(s.seeds).reduce((a, b) => a + b, 0),
    harvested: s.progress.harvested,
    earned: s.progress.earned,
    level: s.progress.level,
    upgradesBought: Object.values(s.progress.upgrades).filter((lvl) => lvl > 0).length,
    animalsOwned: Object.values(s.animalCounts).reduce((a, b) => a + b, 0),
    plantsDiscovered: s.progress.discoveredPlants.length,
    mutationsFound: s.progress.mutationsFound,
  };
}

// Human-readable reward summary for the checklist (e.g. "+300🪙 · +40 XP · +2🌱").
export function rewardLabel(r: GoalReward): string {
  const parts = [`+${r.coins.toLocaleString()}🪙`];
  if (r.xp) parts.push(`+${r.xp} XP`);
  if (r.seed) parts.push(`+${r.seed.count}🌱`);
  return parts.join(' · ');
}
