// Live-number helpers for tooltips. Pure functions that turn economy data +
// the player's UiState into the numbers we show on hover/tap in the Shop,
// Seeds, Bag and Almanac panels.
//
// What we can reflect precisely: the upgrade-based modifiers that live on
// `progress.upgrades` (Fertilizer -> growth speed, Market Stall -> sale price,
// Fortune -> mutation luck). Skill/perk modifiers (FarmScene's `mods()`) are
// NOT pushed into UiState, so we never invent them — tooltips fall back to the
// labelled BASE value when no upgrade applies.

import {
  RARITY,
  MUTATIONS,
  QUALITY,
  type Mutation,
  type Plant,
  type Quality,
  type Rarity,
} from '../game/economy';
import {
  fortuneLuck,
  growthFactor,
  marketBonus,
} from '../game/progression';
import type { Progress } from '../game/types';
import { GROWTH_TIME_SCALE } from '../game/constants';

// One mutation's live odds + payoff for a given plant.
export type MutationOdds = {
  id: string;
  name: string;
  css: string;
  mult: number;
  /** 0..1 chance at harvest, already adjusted for Fortune luck. */
  chance: number;
  /** Coins this crop sells for if it rolls this mutation (base price). */
  value: number;
};

// Format seconds as a compact "1m 4s" / "45s" / "1h 2m" string.
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Format a 0..1 probability as a readable percent ("12%", "1.5%", "0.2%").
export function formatPct(chance: number): string {
  const pct = chance * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

export function rarityCss(rarity: Rarity): string {
  return RARITY[rarity].css;
}

// Compute every mutation's effective odds for one plant, mirroring how
// FarmScene rolls: chance = weight / sum(weights). The Fortune upgrade scales
// every non-Normal weight by `fortuneLuck(level)` (see economy.pickMutation),
// so we reproduce that exactly when a fortune level is supplied.
export function mutationOddsFor(plant: Plant, fortuneLevel = 0): MutationOdds[] {
  const luck = fortuneLuck(fortuneLevel); // 1 at level 0
  const weights = MUTATIONS.map((m) =>
    m.id === 'normal' ? m.weight : m.weight * luck,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  return MUTATIONS.map((m: Mutation, i) => ({
    id: m.id,
    name: m.name,
    css: m.css,
    mult: m.mult,
    chance: total > 0 ? weights[i] / total : 0,
    value: Math.round(plant.baseValue * m.mult),
  }));
}

// The top N non-Normal mutations by odds (defaults to the 3 rarest-but-likeliest
// payoffs). Used for the compact "Mutation odds:" list in tooltips.
export function topMutationOdds(
  plant: Plant,
  fortuneLevel = 0,
  count = 3,
): MutationOdds[] {
  return mutationOddsFor(plant, fortuneLevel)
    .filter((o) => o.id !== 'normal')
    .sort((a, b) => b.chance - a.chance)
    .slice(0, count);
}

// Everything a seed/plant tooltip needs, with live upgrade modifiers folded in
// where we can derive them and clearly flagged when a value is only the BASE.
export type PlantStats = {
  rarity: Rarity;
  rarityCss: string;
  seedCost: number;
  /** Base sell value for a Normal, dry crop. */
  baseValue: number;
  /** Sell value after the Market Stall upgrade multiplier. */
  effectiveValue: number;
  /** True when Market Stall changes the sale price (effective != base). */
  saleBoosted: boolean;
  /** Raw grow time in seconds (no upgrades). */
  baseGrowthSeconds: number;
  /** Grow time after the Fertilizer growth-speed upgrade. */
  effectiveGrowthSeconds: number;
  growthBoosted: boolean;
  fortuneLevel: number;
  fortuneBoosted: boolean;
  mutations: MutationOdds[];
};

// Pull the relevant upgrade levels out of UiState's progress. Upgrades is a
// loose Record<string, number>, so we read defensively (missing => 0).
function upgradeLevel(progress: Progress | undefined, id: string): number {
  return progress?.upgrades?.[id] ?? 0;
}

export function plantStats(plant: Plant, progress?: Progress): PlantStats {
  const growthLvl = upgradeLevel(progress, 'growth');
  const marketLvl = upgradeLevel(progress, 'market');
  const fortuneLvl = upgradeLevel(progress, 'fortune');

  const market = marketBonus(marketLvl); // 1 + 0.1*lvl
  const growth = growthFactor(growthLvl); // 1 + 0.15*lvl (faster -> divide time)

  const effectiveValue = Math.round(plant.baseValue * market);
  // Mirror the gameplay grow time (FarmScene.cropGrowMs applies GROWTH_TIME_SCALE).
  const effectiveGrowthSeconds = (plant.growthSeconds * GROWTH_TIME_SCALE) / growth;

  return {
    rarity: plant.rarity,
    rarityCss: RARITY[plant.rarity].css,
    seedCost: plant.seedCost,
    baseValue: plant.baseValue,
    effectiveValue,
    saleBoosted: marketLvl > 0,
    baseGrowthSeconds: plant.growthSeconds,
    effectiveGrowthSeconds,
    growthBoosted: growthLvl > 0,
    fortuneLevel: fortuneLvl,
    fortuneBoosted: fortuneLvl > 0,
    mutations: topMutationOdds(plant, fortuneLvl, 3),
  };
}

// Numbers for one harvested stack in the Bag. The stack key already encodes the
// rolled mutation + wet flag, so `unitValue` is the realised per-item price; we
// also fold in the Market Stall multiplier so "total" matches what selling pays.
export type StackStats = {
  plant: Plant;
  mutation: Mutation;
  wet: boolean;
  /** Rolled crop quality (none/silver/gold/iridium). */
  quality: Quality;
  /** Quality value multiplier (1 for none). */
  qualityMult: number;
  /** Quality star count (0 for none). */
  qualityStars: number;
  /** CSS colour for the quality stars. */
  qualityCss: string;
  /** Human label for the quality ("Gold" etc). */
  qualityLabel: string;
  /** Whether this crop wilted (left too long) — applies the 0.4 penalty. */
  withered: boolean;
  count: number;
  /** Base sell price for one item (mutation x wet x quality x wilt), no Market upgrade. */
  baseUnitValue: number;
  /** Per-item price after the Market Stall upgrade. */
  unitValue: number;
  /** unitValue x count. */
  total: number;
  saleBoosted: boolean;
};

export function stackStats(
  plant: Plant,
  mutation: Mutation,
  wet: boolean,
  count: number,
  baseUnitValue: number,
  progress?: Progress,
  quality: Quality = 'none',
  withered = false,
): StackStats {
  const marketLvl = upgradeLevel(progress, 'market');
  const market = marketBonus(marketLvl);
  const unitValue = Math.round(baseUnitValue * market);
  const q = QUALITY[quality];
  return {
    plant,
    mutation,
    wet,
    quality,
    qualityMult: q.mult,
    qualityStars: q.stars,
    qualityCss: q.css,
    qualityLabel: q.label,
    withered,
    count,
    baseUnitValue,
    unitValue,
    total: unitValue * count,
    saleBoosted: marketLvl > 0,
  };
}
