// Collection-as-power + Master Gardener completion.
//
// The "milk" model (à la Cookie Clicker): every distinct plant and mutation a
// player has EVER discovered grants a small, PERMANENT global bonus to crop
// sale value. Because discoveries are cumulative and persisted, this makes
// growing one-of-everything — Commons included — a real progression axis, with
// no timers, gacha, or FOMO. Master Gardener % rolls every completion dimension
// into one north-star figure.

import {
  PLANTS,
  PLANT_BY_ID,
  RARITY_ORDER,
  RARITY_UNLOCK,
  MUTATIONS,
  plantFamily,
  familyName,
  type Rarity,
} from './economy';
import { ACHIEVEMENTS, UPGRADES } from './progression';

// Mutations the player can actually "discover" (Normal is the default, never a
// find), so collection math counts only the special ones.
const SPECIAL_MUTATIONS = MUTATIONS.filter((m) => m.id !== 'normal');

// ---- collection bonus ---------------------------------------------------

// Per-discovery sale-value buffs. Re-tuned for the expanded roster (124 plants,
// 10 special mutations) so the *maxed* collection bonus stays a meaningful
// reward without letting income run away:
//   plants:    124 × 0.2% = +24.8%
//   mutations:  10 × 0.3% = + 3%
//   8 tiers    × 1.5%     = +12% (each tier fully discovered)
//   all plants finale     = +12%
// Maxed total ≈ +52% (×1.52) at full completion of every plant.
const PER_PLANT = 0.002;
const PER_MUTATION = 0.003;
const PER_TIER = 0.015; // flat buff for completing a whole rarity tier
const ALL_PLANTS_FINALE = 0.12; // chunky buff for discovering every plant

export type CollectionBonus = {
  mult: number; // sale-value multiplier (1 = no bonus)
  pct: number; // same as (mult - 1) * 100, rounded, for display
  plantPct: number; // contribution from distinct plants (percentage points)
  mutationPct: number; // contribution from distinct mutation types
  tierPct: number; // contribution from completed rarity tiers
  finalePct: number; // contribution from the all-plants finale
  tiersComplete: number; // number of rarity tiers fully discovered
  allPlants: boolean; // every plant discovered?
};

// Which rarity tiers are fully discovered, given the set of discovered plant ids.
export function completedTiers(discoveredPlants: Set<string>): Set<Rarity> {
  const done = new Set<Rarity>();
  for (const r of RARITY_ORDER) {
    const inTier = PLANTS.filter((p) => p.rarity === r);
    if (inTier.length > 0 && inTier.every((p) => discoveredPlants.has(p.id))) {
      done.add(r);
    }
  }
  return done;
}

// Permanent Collection Bonus derived purely from cumulative discoveries. Reads
// live discovery state, so it grows every time the player finds something new.
export function collectionBonus(
  discoveredPlants: Iterable<string>,
  discoveredMutations: Iterable<string>,
): CollectionBonus {
  const dp = discoveredPlants instanceof Set ? discoveredPlants : new Set(discoveredPlants);
  const dm = discoveredMutations instanceof Set ? discoveredMutations : new Set(discoveredMutations);

  // Only count ids that are real plants/special mutations (ignore stale data).
  const plantCount = PLANTS.reduce((n, p) => n + (dp.has(p.id) ? 1 : 0), 0);
  const mutCount = SPECIAL_MUTATIONS.reduce((n, m) => n + (dm.has(m.id) ? 1 : 0), 0);
  const tiers = completedTiers(dp);
  const allPlants = plantCount === PLANTS.length;

  const plantPct = plantCount * PER_PLANT * 100;
  const mutationPct = mutCount * PER_MUTATION * 100;
  const tierPct = tiers.size * PER_TIER * 100;
  const finalePct = allPlants ? ALL_PLANTS_FINALE * 100 : 0;

  const mult = 1 + plantCount * PER_PLANT + mutCount * PER_MUTATION + tiers.size * PER_TIER + (allPlants ? ALL_PLANTS_FINALE : 0);

  return {
    mult,
    pct: Math.round((mult - 1) * 100),
    plantPct,
    mutationPct,
    tierPct,
    finalePct,
    tiersComplete: tiers.size,
    allPlants,
  };
}

// ---- master gardener % --------------------------------------------------

export type MasterGardenerInput = {
  discoveredPlants: Iterable<string>;
  discoveredMutations: Iterable<string>;
  level: number; // global level (drives which rarity tiers are unlocked)
  upgrades: Record<string, number>; // upgrade id -> purchased level
  achievements: Iterable<string>; // earned achievement ids
};

// Weighting of the five completion dimensions (must sum to 1). Discovery is the
// heart of the collection theme, so plants + mutations carry the most weight;
// the rest round out the "everything done" picture.
const W_PLANTS = 0.3;
const W_MUTATIONS = 0.2;
const W_TIERS = 0.15;
const W_UPGRADES = 0.2;
const W_ACHIEVEMENTS = 0.15;

// Total purchasable upgrade levels across every upgrade (sum of each max).
const TOTAL_UPGRADE_LEVELS = UPGRADES.reduce((n, u) => n + u.max, 0);
// Distinct rarity tiers that are gated behind a level (i.e. every tier).
const TOTAL_TIERS = RARITY_ORDER.length;

// One rolled-up 0–100% completion figure — the long-term north star. Reaches
// 100% only at full completion (all plants, all mutations, all tiers unlocked,
// all upgrades maxed, all achievements earned).
export function masterGardenerPct(input: MasterGardenerInput): number {
  const dp = input.discoveredPlants instanceof Set ? input.discoveredPlants : new Set(input.discoveredPlants);
  const dm = input.discoveredMutations instanceof Set ? input.discoveredMutations : new Set(input.discoveredMutations);
  const ach = input.achievements instanceof Set ? input.achievements : new Set(input.achievements);

  const plantFrac = PLANTS.reduce((n, p) => n + (dp.has(p.id) ? 1 : 0), 0) / PLANTS.length;
  const mutFrac = SPECIAL_MUTATIONS.reduce((n, m) => n + (dm.has(m.id) ? 1 : 0), 0) / SPECIAL_MUTATIONS.length;
  const tiersUnlocked = RARITY_ORDER.reduce((n, r) => n + (input.level >= RARITY_UNLOCK[r] ? 1 : 0), 0);
  const tierFrac = tiersUnlocked / TOTAL_TIERS;
  const upgFrac = TOTAL_UPGRADE_LEVELS > 0
    ? UPGRADES.reduce((n, u) => n + Math.min(input.upgrades[u.id] ?? 0, u.max), 0) / TOTAL_UPGRADE_LEVELS
    : 1;
  const achFrac = ACHIEVEMENTS.length > 0
    ? ACHIEVEMENTS.reduce((n, a) => n + (ach.has(a.id) ? 1 : 0), 0) / ACHIEVEMENTS.length
    : 1;

  const score =
    W_PLANTS * plantFrac +
    W_MUTATIONS * mutFrac +
    W_TIERS * tierFrac +
    W_UPGRADES * upgFrac +
    W_ACHIEVEMENTS * achFrac;

  return Math.round(score * 100);
}

// ---- family set bonuses -------------------------------------------------
// Discovering EVERY plant in a family permanently boosts THAT family's crop
// sale value. Unlike the global collection bonus above, this is per-family and
// applies only to that family's crops — turning the Almanac into a set of
// concrete chases (à la Stardew bundles / ACNH critterpedia rewards).
export const FAMILY_SET_BONUS = 0.12; // +12% sale value for a completed family

// Tally found/total per family from the discovered-plant set.
function familyTally(discoveredPlants: Iterable<string>): Map<string, { found: number; total: number }> {
  const dp = discoveredPlants instanceof Set ? discoveredPlants : new Set(discoveredPlants);
  const counts = new Map<string, { found: number; total: number }>();
  for (const p of PLANTS) {
    const f = plantFamily(p);
    const e = counts.get(f) ?? { found: 0, total: 0 };
    e.total++;
    if (dp.has(p.id)) e.found++;
    counts.set(f, e);
  }
  return counts;
}

// Which families are fully discovered.
export function completedFamilies(discoveredPlants: Iterable<string>): Set<string> {
  const done = new Set<string>();
  for (const [f, e] of familyTally(discoveredPlants)) if (e.total > 0 && e.found === e.total) done.add(f);
  return done;
}

// Sale multiplier for one plant given the set of completed families (1 = none).
export function familyBonusFor(plantId: string, completed: Set<string>): number {
  const p = PLANT_BY_ID[plantId];
  if (!p) return 1;
  return completed.has(plantFamily(p)) ? 1 + FAMILY_SET_BONUS : 1;
}

// Per-family discovery progress for the Almanac (sorted most-complete first).
export type FamilyProgress = { key: string; name: string; found: number; total: number; complete: boolean };
export function familyProgress(discoveredPlants: Iterable<string>): FamilyProgress[] {
  return [...familyTally(discoveredPlants).entries()]
    .map(([key, e]) => ({ key, name: familyName(key), found: e.found, total: e.total, complete: e.found === e.total }))
    .sort((a, b) => b.found / b.total - a.found / a.total || a.name.localeCompare(b.name));
}
