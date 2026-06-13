export const TILE = 32;
export const GRID_W = 30;
export const GRID_H = 18;
export const GAME_WIDTH = TILE * GRID_W; // 960
export const GAME_HEIGHT = TILE * GRID_H; // 576

export const PLAYER_SPEED = 175;
export const REACH = 2; // how many tiles away the player can act
export const STARTING_COINS = 300;

// Real-time growth + world timing.
export const STAGES = 4; // crop visual stages (0..3)
export const WET_MS = 45_000; // how long soil stays watered (2x growth while wet)
export const DAY_LENGTH_MS = 8 * 60_000; // full day/night cycle
export const RESTOCK_MS = 120_000; // seed shop restock interval

export const COLORS = {
  grass: 0x5fa64d,
  grassDark: 0x4d8a3e,
  grassLight: 0x79c161,
  soil: 0x7a5230,
  soilDark: 0x5e3f24,
  soilWet: 0x533620,
  soilWetDark: 0x3d2716,
  water: 0x3b82c4,
  waterLight: 0x63a6e0,
  waterDark: 0x2c66a0,
};

export type Tool = { id: 'hoe' | 'can' | 'seed'; label: string };
export const TOOLS: Tool[] = [
  { id: 'hoe', label: 'Hoe' },
  { id: 'can', label: 'Watering Can' },
  { id: 'seed', label: 'Seeds' },
];
