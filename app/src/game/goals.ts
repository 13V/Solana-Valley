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
// feels meaningfully bigger than the last. Defined here, then exported sorted
// by reward size (a good difficulty proxy) so the questline reads in order.
const GOAL_LIST: Goal[] = [
  // Satisfied once you own a seed OR have harvested (so it doesn't un-tick after
  // you plant your starting seeds).
  { id: 'seed', label: 'Get your first seed', test: (s) => s.seedsOwned > 0 || s.harvested > 0, reward: { coins: 25, xp: 5 } },
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
  // --- Quest expansion: early game ---
  { id: 'q_harvest5', label: 'First Basket', test: (s) => s.harvested >= 5, reward: { coins: 60, xp: 12 } },
  { id: 'q_harvest10', label: 'Budding Farmer', test: (s) => s.harvested >= 10, reward: { coins: 100, xp: 18, seed: { id: 'tomato', count: 3 } } },
  { id: 'q_coin250', label: 'Pocket of Sunshine', test: (s) => s.earned >= 250, reward: { coins: 80, xp: 15 } },
  { id: 'q_disc3', label: 'Curious Gardener', test: (s) => s.plantsDiscovered >= 3, reward: { coins: 90, xp: 20, seed: { id: 'beet', count: 3 } } },
  { id: 'q_coin500', label: 'Valley Vendor', test: (s) => s.earned >= 500, reward: { coins: 150, xp: 25 } },
  { id: 'q_harvest50', label: 'Bountiful Season', test: (s) => s.harvested >= 50, reward: { coins: 300, xp: 40 } },
  { id: 'q_coin1000', label: 'Golden Thumb', test: (s) => s.earned >= 1000, reward: { coins: 350, xp: 40, seed: { id: 'eggplant', count: 4 } } },
  { id: 'q_harvest100', label: 'Seasoned Hands', test: (s) => s.harvested >= 100, reward: { coins: 500, xp: 55, seed: { id: 'pumpkin', count: 2 } } },
  // --- Quest expansion: mid game ---
  { id: 'q_harvest_350', label: 'Field Hand', test: (s) => s.harvested >= 350, reward: { coins: 1200, xp: 120 } },
  { id: 'q_earned_5k', label: 'Market Regular', test: (s) => s.earned >= 5000, reward: { coins: 1500, xp: 150, seed: { id: 'cauliflower', count: 3 } } },
  { id: 'q_level_12', label: 'Old Hand', test: (s) => s.level >= 12, reward: { coins: 2000, xp: 200 } },
  { id: 'q_disc_20', label: 'Green Thumb Gazette', test: (s) => s.plantsDiscovered >= 20, reward: { coins: 2500, xp: 180, seed: { id: 'corn', count: 2 } } },
  { id: 'q_harvest_500', label: 'Bumper Crop', test: (s) => s.harvested >= 500, reward: { coins: 3000, xp: 240 } },
  { id: 'q_animals_8', label: 'Petting Zoo', test: (s) => s.animalsOwned >= 8, reward: { coins: 3500, xp: 280, seed: { id: 'pumpkin', count: 2 } } },
  { id: 'q_mutations_10', label: 'Mutation Watcher', test: (s) => s.mutationsFound >= 10, reward: { coins: 6000, xp: 400, seed: { id: 'starfruit', count: 1 } } },
  { id: 'q_earned_50k', label: 'Market Mogul', test: (s) => s.earned >= 50000, reward: { coins: 12000, xp: 600, seed: { id: 'beet', count: 3 } } },
  // --- Quest expansion: late game ---
  { id: 'q_great_harvest', label: 'The Great Harvest', test: (s) => s.harvested >= 1000, reward: { coins: 15000, xp: 700 } },
  { id: 'q_six_figures', label: 'Six Figures', test: (s) => s.earned >= 100000, reward: { coins: 20000, xp: 1000 } },
  { id: 'q_master_botanist', label: 'Master Botanist', test: (s) => s.plantsDiscovered >= 60 && s.level >= 22, reward: { coins: 25000, xp: 1500, seed: { id: 'corn', count: 3 } } },
  { id: 'q_legendary_reaper', label: 'Legendary Reaper', test: (s) => s.harvested >= 2500, reward: { coins: 30000, xp: 1200 } },
  { id: 'q_quarter_million', label: 'Quarter Million Club', test: (s) => s.earned >= 250000, reward: { coins: 50000, xp: 2000, seed: { id: 'pumpkin', count: 3 } } },
  { id: 'q_titan_field', label: 'Titan of the Field', test: (s) => s.harvested >= 5000, reward: { coins: 60000, xp: 2500, seed: { id: 'starfruit', count: 2 } } },
  { id: 'q_mutation_overlord', label: 'Mutation Overlord', test: (s) => s.mutationsFound >= 100 && s.level >= 25, reward: { coins: 80000, xp: 3500, seed: { id: 'starfruit', count: 2 } } },
  { id: 'q_solana_tycoon', label: 'Solana Tycoon', test: (s) => s.earned >= 1000000, reward: { coins: 120000, xp: 4000, seed: { id: 'starfruit', count: 2 } } },
  // --- Quest expansion: endgame / completionist ---
  { id: 'q_grand_harvester', label: 'Grand Harvester', test: (s) => s.harvested >= 10000, reward: { coins: 30000, xp: 3000 } },
  { id: 'q_master_cultivator', label: 'Master Cultivator', test: (s) => s.level >= 30, reward: { coins: 40000, xp: 4000 } },
  { id: 'q_legendary_harvester', label: 'Legendary Harvester', test: (s) => s.harvested >= 25000, reward: { coins: 75000, xp: 7500, seed: { id: 'starfruit', count: 3 } } },
  { id: 'q_coin_tsunami', label: 'Coin Tsunami', test: (s) => s.earned >= 5000000, reward: { coins: 100000, xp: 5000 } },
  { id: 'q_elder_valley', label: 'Elder of the Valley', test: (s) => s.level >= 35, reward: { coins: 120000, xp: 10000 } },
  { id: 'q_millionaire_magnate', label: 'Millionaire Magnate', test: (s) => s.earned >= 25000000, reward: { coins: 250000, xp: 12000, seed: { id: 'pumpkin', count: 3 } } },
  { id: 'q_economic_sovereign', label: 'Economic Sovereign', test: (s) => s.earned >= 100000000, reward: { coins: 500000, xp: 25000, seed: { id: 'starfruit', count: 3 } } },
  { id: 'q_transcendent', label: 'Transcendent Farmer', test: (s) => s.level >= 40 && s.plantsDiscovered >= 196 && s.mutationsFound >= 1000, reward: { coins: 500000, xp: 25000, seed: { id: 'starfruit', count: 5 } } },
];

// Exported ladder: sorted by reward size so the questline always reads
// easiest → hardest regardless of authoring order. Claims are by id, so this
// ordering never affects what's already been completed.
export const GOALS: Goal[] = [...GOAL_LIST].sort((a, b) => a.reward.coins - b.reward.coins);

// ---- goal-set milestones ------------------------------------------------
// Completing a SET of goals (every 10 rungs) hands out a guaranteed RARE seed —
// Divine or above — on top of the per-goal rewards, plus a coin/XP bonus. Seeds
// get rarer the deeper you go; clearing the whole ladder yields a Celestial.
// FarmScene grants these once each (tracked via synthetic `m:<count>` ids in the
// already-persisted claimedGoals set, so no save-format change is needed).
export type GoalMilestone = {
  count: number; // how many goals must be claimed to unlock it
  label: string; // shown in the reward toast / HUD
  seed: { id: string; count: number }; // a Divine+ plant id (guarded in FarmScene)
  coins: number;
  xp: number;
};

export const GOAL_MILESTONES: GoalMilestone[] = [
  { count: 10, label: 'Goal Set I — 10 goals', seed: { id: 'bluerose', count: 2 }, coins: 5000, xp: 300 },
  { count: 20, label: 'Goal Set II — 20 goals', seed: { id: 'frostpumpkin', count: 2 }, coins: 15000, xp: 700 },
  { count: 30, label: 'Goal Set III — 30 goals', seed: { id: 'starfruit', count: 2 }, coins: 40000, xp: 1500 },
  { count: 40, label: 'Goal Set IV — 40 goals', seed: { id: 'moonpetal', count: 1 }, coins: 100000, xp: 3000 },
  { count: 50, label: 'Goal Master — every goal', seed: { id: 'voidbloom', count: 1 }, coins: 300000, xp: 8000 },
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
