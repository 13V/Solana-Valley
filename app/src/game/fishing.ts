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
  { id: 'minnow', name: 'Minnow', rarity: 'Common', value: 12, frame: 3, weight: 80, water: 'any' },
  { id: 'bluegill', name: 'Bluegill', rarity: 'Common', value: 20, frame: 12, weight: 80, water: 'fresh' },
  { id: 'sardine', name: 'Sardine', rarity: 'Common', value: 30, frame: 1, weight: 80, water: 'salt' },
  // Uncommon
  { id: 'perch', name: 'Perch', rarity: 'Uncommon', value: 55, frame: 13, weight: 70, water: 'fresh' },
  { id: 'goldfish', name: 'Goldfish', rarity: 'Uncommon', value: 75, frame: 0, weight: 70, water: 'fresh' },
  { id: 'shrimp', name: 'Pond Shrimp', rarity: 'Uncommon', value: 95, frame: 9, weight: 70, water: 'any' },
  { id: 'koi', name: 'Spotted Koi', rarity: 'Uncommon', value: 85, frame: 4, weight: 70, water: 'fresh' },
  // Rare
  { id: 'bass', name: 'Largemouth Bass', rarity: 'Rare', value: 150, frame: 21, weight: 55, water: 'fresh' },
  { id: 'trout', name: 'Rainbow Trout', rarity: 'Rare', value: 230, frame: 20, weight: 55, water: 'any' },
  { id: 'catfish', name: 'Catfish', rarity: 'Rare', value: 380, frame: 59, weight: 55, water: 'fresh' },
  { id: 'snapper', name: 'Red Snapper', rarity: 'Rare', value: 300, frame: 11, weight: 55, water: 'salt' },
  { id: 'mahimahi', name: 'Mahi-Mahi', rarity: 'Rare', value: 340, frame: 5, weight: 55, water: 'salt' },
  // Legendary
  { id: 'pufferfish', name: 'Pufferfish', rarity: 'Legendary', value: 520, frame: 38, weight: 36, water: 'salt' },
  { id: 'angelfish', name: 'Blue Angelfish', rarity: 'Legendary', value: 780, frame: 68, weight: 36, water: 'salt' },
  { id: 'moonfish', name: 'Moonfish', rarity: 'Legendary', value: 720, frame: 7, weight: 36, water: 'any' },
  // Mythical
  { id: 'manta', name: 'Manta Ray', rarity: 'Mythical', value: 1500, frame: 41, weight: 22, water: 'salt' },
  { id: 'betta', name: 'Crimson Betta', rarity: 'Mythical', value: 2400, frame: 10, weight: 22, water: 'fresh' },
  { id: 'coelacanth', name: 'Coelacanth', rarity: 'Mythical', value: 2000, frame: 14, weight: 22, water: 'salt' },
  // Divine
  { id: 'swordfish', name: 'Swordfish', rarity: 'Divine', value: 5200, frame: 57, weight: 13, water: 'salt' },
  { id: 'ghostshark', name: 'Ghost Shark', rarity: 'Divine', value: 8500, frame: 29, weight: 13, water: 'salt' },
  // Prismatic
  { id: 'prismtang', name: 'Prism Tang', rarity: 'Prismatic', value: 17000, frame: 45, weight: 6, water: 'salt' },
  { id: 'axolotl', name: 'Rainbow Axolotl', rarity: 'Prismatic', value: 30000, frame: 48, weight: 6, water: 'fresh' },
  // Celestial — the white whales.
  { id: 'kraken', name: 'Void Kraken', rarity: 'Celestial', value: 66000, frame: 24, weight: 2.5, water: 'salt' },
  { id: 'eel', name: 'Leviathan Eel', rarity: 'Celestial', value: 140000, frame: 64, weight: 2.5, water: 'any' },
  // --- Drop 14: Big Catch Update ---
  { id: 'nf_sunfish', name: 'Sunfish', rarity: 'Common', value: 18, frame: 2, weight: 80, water: 'fresh' },
  { id: 'nf_mudskipper', name: 'Mudskipper', rarity: 'Common', value: 25, frame: 15, weight: 80, water: 'fresh' },
  { id: 'nf_saltherring', name: 'Salt Herring', rarity: 'Common', value: 14, frame: 16, weight: 80, water: 'salt' },
  { id: 'nf_speckled_perch', name: 'Speckled Perch', rarity: 'Uncommon', value: 72, frame: 17, weight: 70, water: 'fresh' },
  { id: 'nf_ribbon_eel', name: 'Ribbon Eel', rarity: 'Uncommon', value: 88, frame: 18, weight: 70, water: 'salt' },
  { id: 'nf_copperfin', name: 'Copperfin Trout', rarity: 'Rare', value: 210, frame: 19, weight: 55, water: 'fresh' },
  { id: 'nf_duskray', name: 'Dusk Ray', rarity: 'Rare', value: 340, frame: 22, weight: 55, water: 'salt' },
  { id: 'nf_ironjaw', name: 'Ironjaw Pike', rarity: 'Legendary', value: 650, frame: 23, weight: 36, water: 'fresh' },
  { id: 'nf_abyssal_barb', name: 'Abyssal Barb', rarity: 'Legendary', value: 740, frame: 26, weight: 36, water: 'any' },
  { id: 'nf_veilfish', name: 'Veilfish', rarity: 'Mythical', value: 1800, frame: 28, weight: 22, water: 'salt' },
  { id: 'nf_moonwhisker', name: 'Moonwhisker Catfish', rarity: 'Mythical', value: 2200, frame: 30, weight: 22, water: 'fresh' },
  { id: 'nf_gilded_sturgeon', name: 'Gilded Sturgeon', rarity: 'Divine', value: 6400, frame: 31, weight: 13, water: 'any' },
  { id: 'nf_tempest_shark', name: 'Tempest Shark', rarity: 'Divine', value: 7800, frame: 32, weight: 13, water: 'salt' },
  { id: 'nf_prism_lantern', name: 'Prism Lanternfish', rarity: 'Prismatic', value: 22000, frame: 33, weight: 6, water: 'salt' },
  { id: 'nf_aurora_koi', name: 'Aurora Koi', rarity: 'Prismatic', value: 28000, frame: 34, weight: 6, water: 'fresh' },
  { id: 'nf_starweave', name: 'Starweave Eel', rarity: 'Celestial', value: 88000, frame: 35, weight: 2.5, water: 'any' },
  { id: 'nf_void_carp', name: 'Void Carp', rarity: 'Celestial', value: 125000, frame: 36, weight: 2.5, water: 'fresh' },
  { id: 'nf_sol_leviathan', name: 'Sol Leviathan', rarity: 'Celestial', value: 138000, frame: 37, weight: 2.5, water: 'salt' },
  // --- Wave 2: The Deep ---
  { id: 'nf2_mudskipper', name: 'Silt Skipper', rarity: 'Common', value: 14, frame: 39, weight: 80, water: 'fresh' },
  { id: 'nf2_silverling', name: 'Silverling', rarity: 'Common', value: 22, frame: 40, weight: 80, water: 'fresh' },
  { id: 'nf2_sandperch', name: 'Sand Perch', rarity: 'Common', value: 18, frame: 42, weight: 80, water: 'salt' },
  { id: 'nf2_tideguppy', name: 'Tide Guppy', rarity: 'Common', value: 28, frame: 43, weight: 80, water: 'salt' },
  { id: 'nf2_brookdarter', name: 'Brook Darter', rarity: 'Uncommon', value: 62, frame: 44, weight: 70, water: 'fresh' },
  { id: 'nf2_coralsnapper', name: 'Coral Snapper', rarity: 'Uncommon', value: 85, frame: 46, weight: 70, water: 'salt' },
  { id: 'nf2_fenneltrout', name: 'Fennel Trout', rarity: 'Uncommon', value: 74, frame: 47, weight: 70, water: 'fresh' },
  { id: 'nf2_saltwhisker', name: 'Saltwhisker', rarity: 'Rare', value: 210, frame: 49, weight: 55, water: 'salt' },
  { id: 'nf2_glasseel', name: 'Glass Eel', rarity: 'Rare', value: 275, frame: 50, weight: 55, water: 'any' },
  { id: 'nf2_moonbream', name: 'Moon Bream', rarity: 'Rare', value: 340, frame: 51, weight: 55, water: 'fresh' },
  { id: 'nf2_vaultpike', name: 'Vault Pike', rarity: 'Legendary', value: 590, frame: 52, weight: 36, water: 'fresh' },
  { id: 'nf2_deepcrown', name: 'Deep Crown', rarity: 'Legendary', value: 730, frame: 53, weight: 36, water: 'salt' },
  { id: 'nf2_emberfin', name: 'Emberfin', rarity: 'Mythical', value: 1750, frame: 54, weight: 22, water: 'any' },
  { id: 'nf2_abyssalray', name: 'Abyssal Ray', rarity: 'Mythical', value: 2300, frame: 55, weight: 22, water: 'salt' },
  { id: 'nf2_solarshark', name: 'Solar Shark', rarity: 'Divine', value: 6400, frame: 56, weight: 13, water: 'salt' },
  { id: 'nf2_dawnloach', name: 'Dawn Loach', rarity: 'Divine', value: 7800, frame: 58, weight: 13, water: 'fresh' },
  { id: 'nf2_spectralsalmon', name: 'Spectral Salmon', rarity: 'Prismatic', value: 22000, frame: 63, weight: 6, water: 'any' },
  { id: 'nf2_voidleviathan', name: 'Void Leviathan', rarity: 'Prismatic', value: 27500, frame: 65, weight: 6, water: 'salt' },
  { id: 'nf2_starweaverfish', name: 'Starweaver Fish', rarity: 'Celestial', value: 88000, frame: 66, weight: 2.5, water: 'any' },
  { id: 'nf2_eternaltide', name: 'Eternal Tide', rarity: 'Celestial', value: 125000, frame: 67, weight: 2.5, water: 'fresh' },
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
  const weights = pool.map((f) => f.weight * (1 + (luck - 1) * rarityRank(f.rarity) * 0.6));
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
