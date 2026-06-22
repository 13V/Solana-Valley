// Progression: XP/levels, permanent upgrades, and achievements. Selling crops
// earns coins + XP; levels unlock rarer seed tiers (see RARITY_UNLOCK in
// economy.ts); coins buy upgrades that compound the economy.

import { PLANTS } from './economy';

// ---- levels -------------------------------------------------------------

// Cumulative XP required to *reach* a given level (level 1 = 0 XP). Steepened
// (was 60·l^1.5) to slow the climb so high-value tiers unlock later — the early
// curve let players reach the top crops far too fast.
export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += Math.round(100 * Math.pow(l, 1.6));
  return total;
}

export type LevelInfo = { level: number; into: number; need: number; pct: number };

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const need = next - cur;
  const into = xp - cur;
  return { level, into, need, pct: need > 0 ? into / need : 1 };
}

// XP granted when a crop is harvested (rarer plants are worth more).
export function harvestXp(baseValue: number): number {
  return Math.max(2, Math.round(Math.sqrt(baseValue) * 1.5));
}

// ---- upgrades -----------------------------------------------------------

export type UpgradeId = 'water' | 'hoe' | 'growth' | 'fortune' | 'supply' | 'sprinkler' | 'market';

// A one-time specialization offered when an upgrade hits MAX level. Mirrors the
// skill milestone perk pattern (skills.ts): pick 1-of-2 to fork the upgrade down
// a thematic path. Effects are a small typed bag the FarmScene effect sites read
// (see UPGRADE_FORK_DEFAULTS + forkEffect). Keep values CONSERVATIVE so no fork
// dominates the others.
export type ForkEffect = {
  sprinklerIntervalMult?: number; // multiplies the sprinkler auto-water interval (<1 = waters more often)
  growthMult?: number; // extra crop growth-speed multiplier (still under MAX_GROWTH_MULT)
  cropDoubleChance?: number; // chance a harvest yields an extra crop
  mutationLuckMult?: number; // extra mutation-luck multiplier
  topMutationLuckMult?: number; // extra luck applied ONLY to the top mutations (Gold/Rainbow)
  saleFlatBonus?: number; // flat extra coins per crop sold
  rareSaleMult?: number; // extra sale multiplier for higher-rarity crops (Legendary+)
  seedDiscount?: number; // fraction off ALL seed prices (0.08 = 8% cheaper)
  rareSeedDiscount?: number; // additional fraction off Legendary+ seed prices
};

export type Fork = { id: string; name: string; desc: string; eff: ForkEffect };

export type UpgradeDef = {
  id: UpgradeId;
  name: string;
  icon: string;
  max: number;
  cost: (level: number) => number; // cost to go from `level` -> level+1
  desc: (level: number) => string; // effect at a given level
  req?: number; // required global level to buy at all (undefined = always available)
  // Optional 1-of-2 specialization unlocked at MAX level (see Fork above). An
  // upgrade without a meaningful dual path simply omits this (e.g. Hoe/Can).
  fork?: { a: Fork; b: Fork };
};

const areaDesc = (lvl: number) => ['1 tile', '3×3 tiles', '5×5 tiles', '7×7 tiles'][lvl] ?? 'huge';

export const UPGRADES: UpgradeDef[] = [
  // Tool reach: the bigger areas (5×5, 7×7) used to scale quadratically and sat
  // as dead end-game buys. Flattened to a gentler linear curve so each tier is
  // attainable mid-game and worth grabbing.
  { id: 'water', name: 'Watering Can', icon: 'assets/sprout-ui/tool_can.png', max: 3, cost: (l) => 200 + 350 * l, desc: areaDesc },
  { id: 'hoe', name: 'Hoe', icon: 'assets/sprout-ui/tool_hoe.png', max: 3, cost: (l) => 200 + 350 * l, desc: areaDesc },
  { id: 'growth', name: 'Fertilizer', icon: 'assets/sprout-ui/tool_seed.png', max: 5, cost: (l) => 250 * (l + 1) * (l + 1), desc: (l) => `+${l * 15}% growth speed`,
    fork: {
      a: { id: 'rapid', name: 'Rapid', desc: '+25% growth speed (under the growth cap)', eff: { growthMult: 0.25 } },
      b: { id: 'bountiful', name: 'Bountiful', desc: '10% chance a harvest yields a bonus crop', eff: { cropDoubleChance: 0.10 } },
    } },
  // Fortune: was the priciest upgrade yet the weakest payoff. Cheaper curve +
  // a stronger per-level effect (+30% luck/level) so its ROI matches the rest.
  { id: 'fortune', name: 'Fortune', icon: 'assets/sprout-ui/icon_star.png', max: 5, cost: (l) => 250 * (l + 1) * (l + 1), desc: (l) => `+${l * 30}% mutation luck`, req: 4,
    fork: {
      a: { id: 'clover', name: 'Lucky Clover', desc: '+40% mutation luck across the board', eff: { mutationLuckMult: 0.40 } },
      b: { id: 'jackpot', name: 'Jackpot', desc: '×2 odds of the top mutations (Gold/Rainbow)', eff: { topMutationLuckMult: 1 } },
    } },
  // Shop is shared per island now (deterministic + wall-clock restock), so the
  // old per-player restock/luck effects don't apply. Repurposed as a modest
  // personal SEED DISCOUNT (seeds are cheap vs crop value, so this stays minor).
  { id: 'supply', name: 'Shop Supply', icon: 'assets/sprout-ui/ic_cart_brown.png', max: 3, cost: (l) => 300 * (l + 1) * (l + 1), desc: (l) => `${l * 4}% off seed prices`,
    fork: {
      a: { id: 'stockpile', name: 'Bulk Buyer', desc: '−8% off all seed prices', eff: { seedDiscount: 0.08 } },
      b: { id: 'eye', name: "Connoisseur's Eye", desc: '−20% off Legendary+ seed prices', eff: { rareSeedDiscount: 0.20 } },
    } },
  { id: 'sprinkler', name: 'Sprinkler', icon: 'assets/sprout-ui/ic_pond.png', max: 3, cost: (l) => 500 * (l + 1) * (l + 1), desc: (l) => (l === 0 ? 'off' : `auto-waters every ${Math.round(45 / l)}s`), req: 6,
    fork: {
      a: { id: 'wide', name: 'Wide', desc: 'auto-waters 25% more often (keeps more soil wet)', eff: { sprinklerIntervalMult: 0.75 } },
      b: { id: 'misting', name: 'Misting', desc: '+25% mutation luck on watered (wet) tiles', eff: { mutationLuckMult: 0.25 } },
    } },
  // Market Stall: the best ROI of the lot, so nudged a touch pricier. Its bonus
  // is now surfaced in the sell toast (FarmScene) so players feel it land.
  { id: 'market', name: 'Market Stall', icon: 'assets/sprout-ui/icon_coin.png', max: 5, cost: (l) => 450 * (l + 1) * (l + 1), desc: (l) => `+${l * 10}% crop sale price`,
    fork: {
      a: { id: 'wholesale', name: 'Wholesale', desc: '+12 coins flat per crop sold', eff: { saleFlatBonus: 12 } },
      b: { id: 'connoisseur', name: 'Connoisseur', desc: '+30% sale price on Legendary+ crops', eff: { rareSaleMult: 0.30 } },
    } },
];

export const UPGRADE_BY_ID: Record<UpgradeId, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
) as Record<UpgradeId, UpgradeDef>;

export type Upgrades = Record<UpgradeId, number>;
export const EMPTY_UPGRADES: Upgrades = { water: 0, hoe: 0, growth: 0, fortune: 0, supply: 0, sprinkler: 0, market: 0 };

// Effects
export const toolRadius = (lvl: number) => lvl; // 0=1 tile, 1=3x3, 2=5x5, 3=7x7
export const growthFactor = (lvl: number) => 1 + 0.15 * lvl;
export const fortuneLuck = (lvl: number) => 1 + 0.3 * lvl;
export const seedDiscount = (lvl: number) => lvl * 0.04; // 4% off seeds per Shop Supply level (max 12%)
export const marketBonus = (lvl: number) => 1 + 0.1 * lvl; // crop sale price multiplier
export const sprinklerIntervalMs = (lvl: number) => (lvl > 0 ? 45_000 / lvl : Infinity);

// Ceiling on the *combined* crop growth-speed multiplier (Fertilizer + Farming
// skill + the wet ×2). Without it, maxed Fertilizer stacked with skill perks and
// a wet tile trivializes growth into near-instant; this keeps watering and the
// bonuses meaningful while leaving a sane floor on grow time. Applied in
// FarmScene where the final growth rate is assembled.
export const MAX_GROWTH_MULT = 3;

// An upgrade is buyable only once the player's global level meets its `req`.
export const upgradeUnlocked = (def: UpgradeDef, level: number) => !def.req || level >= def.req;

// ---- upgrade forks ------------------------------------------------------

// Chosen forks: upgrade id -> chosen fork id. Mirrors ChosenPerks in skills.ts.
export type UpgradeForks = Partial<Record<UpgradeId, string>>;
export const EMPTY_UPGRADE_FORKS: UpgradeForks = {};

// Neutral fork-effect bag (every site reads from this shape; absent paths are 0/1).
export const EMPTY_FORK_EFFECT: Required<ForkEffect> = {
  sprinklerIntervalMult: 1,
  growthMult: 0,
  cropDoubleChance: 0,
  mutationLuckMult: 0,
  topMutationLuckMult: 0,
  saleFlatBonus: 0,
  rareSaleMult: 0,
  seedDiscount: 0,
  rareSeedDiscount: 0,
};

// A fork is only choosable once its upgrade is at MAX level.
export const upgradeForkAvailable = (def: UpgradeDef, lvl: number) => !!def.fork && lvl >= def.max;

// Resolve the active fork effect for a single upgrade (or the neutral bag if no
// fork is chosen / the upgrade has no fork). Effect-site callers read named
// fields off the result and fall back to the neutral defaults automatically.
export function forkEffect(id: UpgradeId, forks: UpgradeForks): ForkEffect {
  const def = UPGRADE_BY_ID[id];
  const chosen = forks[id];
  if (!def?.fork || !chosen) return EMPTY_FORK_EFFECT;
  if (chosen === def.fork.a.id) return def.fork.a.eff;
  if (chosen === def.fork.b.id) return def.fork.b.eff;
  return EMPTY_FORK_EFFECT;
}

// The chosen Fork object for an upgrade, or null (used by the UI to label it).
export function chosenFork(id: UpgradeId, forks: UpgradeForks): Fork | null {
  const def = UPGRADE_BY_ID[id];
  const chosen = forks[id];
  if (!def?.fork || !chosen) return null;
  if (chosen === def.fork.a.id) return def.fork.a;
  if (chosen === def.fork.b.id) return def.fork.b;
  return null;
}

// ---- achievements -------------------------------------------------------

export type ProgressStats = {
  earned: number;
  harvested: number;
  mutationsFound: number;
  plantsDiscovered: number;
  level: number;
};

export type Achievement = {
  id: string;
  name: string;
  desc: string;
  reward: number; // coins
  xp: number; // global XP granted on claim (≈ reward/10, min 25)
  test: (s: ProgressStats) => boolean;
};

// Global XP for an achievement: roughly proportional to its coin reward so big
// milestones nudge the level meter, with a small floor so cheap ones still count.
const achXp = (reward: number) => Math.max(25, Math.round(reward / 10));

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_harvest', name: 'First Sprout', desc: 'Harvest your first crop', reward: 50, xp: achXp(50), test: (s) => s.harvested >= 1 },
  { id: 'green_thumb', name: 'Green Thumb', desc: 'Harvest 50 crops', reward: 500, xp: achXp(500), test: (s) => s.harvested >= 50 },
  { id: 'farmhand', name: 'Farmhand', desc: 'Harvest 250 crops', reward: 2500, xp: achXp(2500), test: (s) => s.harvested >= 250 },
  { id: 'first_mutation', name: 'Oddity', desc: 'Find your first mutation', reward: 250, xp: achXp(250), test: (s) => s.mutationsFound >= 1 },
  { id: 'mutant', name: 'Mutation Master', desc: 'Find 25 mutations', reward: 3000, xp: achXp(3000), test: (s) => s.mutationsFound >= 25 },
  { id: 'botanist', name: 'Botanist', desc: 'Discover 8 different plants', reward: 1000, xp: achXp(1000), test: (s) => s.plantsDiscovered >= 8 },
  { id: 'collector', name: 'Master Collector', desc: `Discover all ${PLANTS.length} plants`, reward: 12000, xp: achXp(12000), test: (s) => s.plantsDiscovered >= PLANTS.length },
  { id: 'rich', name: 'Tidy Profit', desc: 'Earn 10,000 coins total', reward: 1000, xp: achXp(1000), test: (s) => s.earned >= 10000 },
  { id: 'tycoon', name: 'Valley Tycoon', desc: 'Earn 100,000 coins total', reward: 15000, xp: achXp(15000), test: (s) => s.earned >= 100000 },
  { id: 'seasoned', name: 'Seasoned Farmer', desc: 'Reach level 10', reward: 2000, xp: achXp(2000), test: (s) => s.level >= 10 },
  { id: 'veteran', name: 'Valley Veteran', desc: 'Reach level 20', reward: 6000, xp: achXp(6000), test: (s) => s.level >= 20 },
  { id: 'harvest_king', name: 'Harvest King', desc: 'Harvest 1,000 crops', reward: 8000, xp: achXp(8000), test: (s) => s.harvested >= 1000 },
  { id: 'mutation_hoarder', name: 'Mutation Hoarder', desc: 'Find 100 mutations', reward: 10000, xp: achXp(10000), test: (s) => s.mutationsFound >= 100 },
  { id: 'millionaire', name: 'Valley Millionaire', desc: 'Earn 1,000,000 coins total', reward: 50000, xp: achXp(50000), test: (s) => s.earned >= 1000000 },
  // --- Drop 17: Achievement Pack ---
  { id: 'ach_harvest_500', name: 'Bumper Crop', desc: 'Harvest 500 crops', reward: 750, xp: achXp(750), test: (s) => s.harvested >= 500 },
  { id: 'ach_harvest_5000', name: 'Valley Legend', desc: 'Harvest 5,000 crops', reward: 5000, xp: achXp(5000), test: (s) => s.harvested >= 5000 },
  { id: 'ach_mutations_10', name: 'Curious Cultivator', desc: 'Find 10 mutations', reward: 500, xp: achXp(500), test: (s) => s.mutationsFound >= 10 },
  { id: 'ach_mutations_50', name: 'Mutation Maven', desc: 'Find 50 mutations', reward: 2000, xp: achXp(2000), test: (s) => s.mutationsFound >= 50 },
  { id: 'ach_mutations_250', name: 'Aberrant Arborist', desc: 'Find 250 mutations', reward: 10000, xp: achXp(10000), test: (s) => s.mutationsFound >= 250 },
  { id: 'ach_plants_15', name: 'Diverse Harvester', desc: 'Discover 15 different plants', reward: 1500, xp: achXp(1500), test: (s) => s.plantsDiscovered >= 15 },
  { id: 'ach_earned_500k', name: 'Half a Million', desc: 'Earn 500,000 coins total', reward: 8000, xp: achXp(8000), test: (s) => s.earned >= 500000 },
  { id: 'ach_level_25', name: 'Valley Master', desc: 'Reach level 25', reward: 3000, xp: achXp(3000), test: (s) => s.level >= 25 },
  // --- Wave 2: deep-progression achievements ---
  { id: 'ach2_harvest_10k', name: 'Bumper Season', desc: 'Harvest 10,000 crops', reward: 5000, xp: achXp(5000), test: (s) => s.harvested >= 10000 },
  { id: 'ach2_harvest_25k', name: 'Legendary Yield', desc: 'Harvest 25,000 crops', reward: 15000, xp: achXp(15000), test: (s) => s.harvested >= 25000 },
  { id: 'ach2_mutations_500', name: 'Twisted Naturalist', desc: 'Find 500 mutations', reward: 20000, xp: achXp(20000), test: (s) => s.mutationsFound >= 500 },
  { id: 'ach2_mutations_1k', name: 'Master of Chaos', desc: 'Find 1,000 mutations', reward: 50000, xp: achXp(50000), test: (s) => s.mutationsFound >= 1000 },
  { id: 'ach2_plants_30', name: 'Botanical Scholar', desc: 'Discover 30 plants', reward: 8000, xp: achXp(8000), test: (s) => s.plantsDiscovered >= 30 },
  { id: 'ach2_plants_50', name: 'Verdant Encyclopedist', desc: 'Discover 50 plants', reward: 25000, xp: achXp(25000), test: (s) => s.plantsDiscovered >= 50 },
  { id: 'ach2_plants_100', name: 'Flora Omnia', desc: 'Discover 100 plant species', reward: 100000, xp: achXp(100000), test: (s) => s.plantsDiscovered >= 100 },
  { id: 'ach2_earned_5m', name: 'Coin Magnate', desc: 'Earn 5,000,000 coins total', reward: 30000, xp: achXp(30000), test: (s) => s.earned >= 5000000 },
  { id: 'ach2_earned_25m', name: 'Solana Baron', desc: 'Earn 25,000,000 coins total', reward: 100000, xp: achXp(100000), test: (s) => s.earned >= 25000000 },
  { id: 'ach2_earned_100m', name: 'The Golden Harvest', desc: 'Earn 100,000,000 coins total', reward: 250000, xp: achXp(250000), test: (s) => s.earned >= 100000000 },
  { id: 'ach2_level_30', name: 'Seasoned Grower', desc: 'Reach level 30', reward: 12000, xp: achXp(12000), test: (s) => s.level >= 30 },
  { id: 'ach2_level_40', name: 'Valley Elder', desc: 'Reach level 40', reward: 40000, xp: achXp(40000), test: (s) => s.level >= 40 },
];
