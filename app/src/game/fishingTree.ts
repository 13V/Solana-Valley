// The Angler's Tree: a dedicated fishing skill tree, separate from the shared
// five-skill system. You earn FISHING POINTS by landing fish (rarer = more) and
// spend them on a branching tree of nodes. Where the generic Fishing *skill*
// ladders value/luck passively, the tree unlocks NEW angling mechanics — faster
// bites, a wider hook window, double catches — plus more value/luck/treasure.
//
// Every node folds its bonuses into the SAME `Modifiers` bag FarmScene already
// reads (see skills.ts), so gameplay picks them up with zero extra plumbing:
// FarmScene just calls `applyFishTree(activeModifiers(...), unlockedNodes)`.

import { rarityRank, type Rarity } from './economy';
import type { Modifiers } from './skills';

export type FishBranchId = 'fortune' | 'bounty' | 'technique';

export type FishBranch = { id: FishBranchId; name: string; color: string; blurb: string };

// The three branches (rendered as columns in the panel).
export const FISH_BRANCHES: FishBranch[] = [
  { id: 'fortune',   name: 'Fortune',   color: '#7bd0ff', blurb: 'Hook rarer fish' },
  { id: 'bounty',    name: 'Bounty',    color: '#ffd24a', blurb: 'Earn more per catch' },
  { id: 'technique', name: 'Technique', color: '#8be08b', blurb: 'Faster, easier casts' },
];

export type FishNode = {
  id: string;
  name: string;
  desc: string;
  branch: FishBranchId | 'capstone';
  tier: number; // row within the branch (1-based); capstone uses 4
  cost: number; // fishing points to unlock
  requires: string[]; // node ids that must be unlocked first (ALL of them)
  mods: Partial<Modifiers>;
};

// Three branches × three tiers, converging on a single capstone that needs all
// three branch tips. Costs ladder 1 → 2 → 4 per branch (6 for the capstone).
export const FISH_TREE: FishNode[] = [
  // Fortune — rarer fish
  { id: 'f_keen',   name: 'Keen Eye',    desc: '+25% rare-catch luck',               branch: 'fortune', tier: 1, cost: 1, requires: [],         mods: { fishLuckMult: 0.25 } },
  { id: 'f_lure',   name: 'Lucky Lure',  desc: '+35% rare-catch luck',               branch: 'fortune', tier: 2, cost: 2, requires: ['f_keen'], mods: { fishLuckMult: 0.35 } },
  { id: 'f_legend', name: 'Legend Seeker', desc: 'Can hook legendary fish · +25% luck', branch: 'fortune', tier: 3, cost: 4, requires: ['f_lure'], mods: { fishLuckMult: 0.25, legendaryFish: true } },

  // Bounty — more coins / yield
  { id: 'b_monger', name: 'Fishmonger',   desc: '+30% fish value',                   branch: 'bounty', tier: 1, cost: 1, requires: [],            mods: { fishValueMult: 0.30 } },
  { id: 'b_double', name: 'Double Catch', desc: '15% chance to land two fish at once', branch: 'bounty', tier: 2, cost: 2, requires: ['b_monger'], mods: { fishDoubleCatchChance: 0.15 } },
  { id: 'b_trophy', name: 'Trophy Hunter', desc: '+45% fish value',                  branch: 'bounty', tier: 3, cost: 4, requires: ['b_double'], mods: { fishValueMult: 0.45 } },

  // Technique — the cast minigame feel
  { id: 't_quick',    name: 'Quick Bite',     desc: 'Fish bite ~35% sooner',          branch: 'technique', tier: 1, cost: 1, requires: [],           mods: { fishBiteSpeedMult: 0.35 } },
  { id: 't_steady',   name: 'Steady Hands',   desc: '+60% wider hook window',         branch: 'technique', tier: 2, cost: 2, requires: ['t_quick'],  mods: { fishHookWindowMult: 0.60 } },
  { id: 't_treasure', name: 'Treasure Diver', desc: '15% chance to reel treasure · +40% window', branch: 'technique', tier: 3, cost: 4, requires: ['t_steady'], mods: { treasureChance: 0.15, fishHookWindowMult: 0.40 } },

  // Capstone — needs all three branch tips
  { id: 'grand_angler', name: 'Grand Angler', desc: '+50% value & luck · +50% fishing points', branch: 'capstone', tier: 4, cost: 6, requires: ['f_legend', 'b_trophy', 't_treasure'], mods: { fishValueMult: 0.50, fishLuckMult: 0.50, fishPtMult: 0.50 } },
];

export const FISH_NODE_BY_ID: Record<string, FishNode> = Object.fromEntries(FISH_TREE.map((n) => [n.id, n]));

// Fishing points earned for landing a fish — rarer fish pay out more so chasing
// the rare tail also funds the tree faster. Common = 1 … Celestial = 8.
export function fishPointsForCatch(rarity: Rarity): number {
  return 1 + rarityRank(rarity);
}

// Total points already committed to unlocked nodes.
export function spentPoints(unlocked: Iterable<string>): number {
  let n = 0;
  for (const id of unlocked) n += FISH_NODE_BY_ID[id]?.cost ?? 0;
  return n;
}

// Points still available to spend.
export function availablePoints(earned: number, unlocked: Iterable<string>): number {
  return earned - spentPoints(unlocked);
}

// Are all of a node's prerequisites unlocked?
export function prereqMet(node: FishNode, unlocked: Iterable<string>): boolean {
  const set = unlocked instanceof Set ? (unlocked as Set<string>) : new Set(unlocked);
  return node.requires.every((r) => set.has(r));
}

// Fold every unlocked node's bonuses into the modifier bag (mutates & returns).
export function applyFishTree(m: Modifiers, unlocked: Iterable<string>): Modifiers {
  const rec = m as unknown as Record<string, number | boolean>;
  for (const id of unlocked) {
    const node = FISH_NODE_BY_ID[id];
    if (!node) continue;
    for (const [k, val] of Object.entries(node.mods)) {
      if (typeof val === 'boolean') rec[k] = (rec[k] as boolean) || val;
      else (rec[k] as number) += val as number;
    }
  }
  return m;
}
