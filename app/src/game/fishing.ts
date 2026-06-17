// Fishing: cast at the pond (fresh water) or the open sea (salt water) and play
// the cast → bite → hook minigame to land a fish. Species run the SAME rarity
// ladder as the crops (Common → Celestial), so a rare catch feels as special as
// a rare seed, and the coin values slot into the existing economy.
//
// This module is pure data + selection logic. The cast choreography (rod, line,
// bubbles, the bob you click) lives in `fishingCast.ts`; FarmScene wires the two
// together and awards coins/XP.

import { Rarity, RARITY, rarityRank } from './economy';

// The Fish-Sheet art: a 9×8 grid of 32px frames (72 frames total). Loaded in
// BootScene under this key. Frame index = row * 9 + col.
export const FISH_SHEET = 'fish';
export const FISH_FRAME = 32;
export const FISH_SHEET_COLS = 9;

// Non-fish frames we reuse for tackle + treasure choreography.
export const TACKLE = {
  bobber: 62, // classic red/white float — the bob you click
  hookSilver: 25,
  hookTan: 27,
  baitWorm: 60,
  baitDough: 61,
} as const;

// Reeled instead of a fish on a lucky "treasure" cast (Treasure Hunter perk).
export const TREASURE_FRAMES = [6, 8] as const; // jewelled orb, pearl clam

export type WaterKind = 'fresh' | 'salt' | 'any';

export type Fish = {
  id: string;
  name: string;
  rarity: Rarity; // same ladder as crops — drives colour, glow, almanac
  value: number; // coins awarded on catch (pre-skill multipliers)
  frame: number; // sprite index in the Fish-Sheet
  weight: number; // relative catch chance at luck 1 (higher = more common)
  water: WaterKind; // where it bites; 'any' shows up everywhere
};

// The roster, ordered common → celestial. Frames are picked from the sheet to
// match each fish's vibe. Values ladder up the rarity tiers and sit a touch
// below the equivalent crop (fishing has no seed cost — it's a pure faucet),
// while the rare tail (Divine+) stays valuable enough to chase.
export const FISH: Fish[] = [
  // Common — the everyday nibble, always biting.
  { id: 'minnow', name: 'Minnow', rarity: 'Common', value: 12, frame: 3, weight: 100, water: 'any' },
  { id: 'bluegill', name: 'Bluegill', rarity: 'Common', value: 20, frame: 12, weight: 100, water: 'fresh' },
  { id: 'sardine', name: 'Sardine', rarity: 'Common', value: 30, frame: 1, weight: 100, water: 'salt' },
  // Uncommon
  { id: 'perch', name: 'Perch', rarity: 'Uncommon', value: 55, frame: 13, weight: 64, water: 'fresh' },
  { id: 'goldfish', name: 'Goldfish', rarity: 'Uncommon', value: 75, frame: 0, weight: 64, water: 'fresh' },
  { id: 'shrimp', name: 'Pond Shrimp', rarity: 'Uncommon', value: 95, frame: 9, weight: 64, water: 'any' },
  // Rare
  { id: 'bass', name: 'Largemouth Bass', rarity: 'Rare', value: 150, frame: 21, weight: 38, water: 'fresh' },
  { id: 'trout', name: 'Rainbow Trout', rarity: 'Rare', value: 230, frame: 20, weight: 38, water: 'any' },
  { id: 'catfish', name: 'Catfish', rarity: 'Rare', value: 380, frame: 59, weight: 38, water: 'fresh' },
  { id: 'snapper', name: 'Red Snapper', rarity: 'Rare', value: 300, frame: 11, weight: 38, water: 'salt' },
  // Legendary
  { id: 'pufferfish', name: 'Pufferfish', rarity: 'Legendary', value: 520, frame: 38, weight: 20, water: 'salt' },
  { id: 'angelfish', name: 'Blue Angelfish', rarity: 'Legendary', value: 780, frame: 68, weight: 20, water: 'salt' },
  // Mythical
  { id: 'manta', name: 'Manta Ray', rarity: 'Mythical', value: 1500, frame: 41, weight: 10, water: 'salt' },
  { id: 'betta', name: 'Crimson Betta', rarity: 'Mythical', value: 2400, frame: 10, weight: 10, water: 'fresh' },
  // Divine
  { id: 'swordfish', name: 'Swordfish', rarity: 'Divine', value: 5200, frame: 57, weight: 5, water: 'salt' },
  { id: 'ghostshark', name: 'Ghost Shark', rarity: 'Divine', value: 8500, frame: 29, weight: 5, water: 'salt' },
  // Prismatic
  { id: 'prismtang', name: 'Prism Tang', rarity: 'Prismatic', value: 17000, frame: 45, weight: 2, water: 'salt' },
  { id: 'axolotl', name: 'Rainbow Axolotl', rarity: 'Prismatic', value: 30000, frame: 48, weight: 2, water: 'fresh' },
  // Celestial — the white whales.
  { id: 'kraken', name: 'Void Kraken', rarity: 'Celestial', value: 66000, frame: 24, weight: 0.8, water: 'salt' },
  { id: 'eel', name: 'Leviathan Eel', rarity: 'Celestial', value: 140000, frame: 64, weight: 0.8, water: 'any' },
];

export const FISH_BY_ID: Record<string, Fish> = Object.fromEntries(FISH.map((f) => [f.id, f]));

// Rarity-driven colours for popups / glow / particle tints (the sprite itself is
// drawn untinted — the colour is just the flourish around it).
export function fishColor(fish: Fish): number {
  return RARITY[fish.rarity].color;
}
export function fishCss(fish: Fish): string {
  return RARITY[fish.rarity].css;
}

// Pick a fish. `luck` (>=1, from the Fishing skill) tilts the odds toward rarer
// tiers; `water` restricts the pool to what bites here ('any' = no restriction,
// e.g. the open sea reaches every saltwater + neutral species).
export function catchFish(luck = 1, water: WaterKind = 'any'): Fish {
  const pool = FISH.filter((f) => water === 'any' || f.water === 'any' || f.water === water);
  const weights = pool.map((f) => f.weight * (1 + (luck - 1) * rarityRank(f.rarity) * 0.45));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[0];
}

// XP for landing a fish (rarer/heavier = more), scaled off its coin value.
export function fishXp(fish: Fish): number {
  return Math.max(4, Math.round(Math.sqrt(fish.value) * 1.4));
}
