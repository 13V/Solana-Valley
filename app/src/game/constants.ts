export const TILE = 32;
export const GRID_W = 30;
export const GRID_H = 18;
export const GAME_WIDTH = TILE * GRID_W; // 960
export const GAME_HEIGHT = TILE * GRID_H; // 576

export const PLAYER_SPEED = 170;
export const REACH = 2; // how many tiles away the player can act, in tiles
export const STARTING_COINS = 500;

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

export type CropDef = {
  id: string;
  name: string;
  seedId: string;
  produceId: string;
  seedCost: number;
  sellPrice: number;
  daysToGrow: number;
  color: number; // fruit color used for the mature-crop sprite
};

export const CROPS: Record<string, CropDef> = {
  parsnip: {
    id: 'parsnip', name: 'Parsnip', seedId: 'parsnip_seed', produceId: 'parsnip',
    seedCost: 20, sellPrice: 35, daysToGrow: 4, color: 0xe8c170,
  },
  potato: {
    id: 'potato', name: 'Potato', seedId: 'potato_seed', produceId: 'potato',
    seedCost: 30, sellPrice: 60, daysToGrow: 5, color: 0xc8843c,
  },
  cauliflower: {
    id: 'cauliflower', name: 'Cauliflower', seedId: 'cauliflower_seed', produceId: 'cauliflower',
    seedCost: 60, sellPrice: 130, daysToGrow: 7, color: 0xeae6c8,
  },
};

export const CROP_LIST = Object.values(CROPS);

// seedId -> cropId, for resolving which crop a seed plants.
export const SEED_TO_CROP: Record<string, string> = Object.fromEntries(
  CROP_LIST.map((c) => [c.seedId, c.id]),
);

export type HotbarSlot = { id: string; label: string; kind: 'tool' | 'seed' };

export const HOTBAR: HotbarSlot[] = [
  { id: 'hoe', label: 'Hoe', kind: 'tool' },
  { id: 'can', label: 'Watering Can', kind: 'tool' },
  { id: 'parsnip_seed', label: 'Parsnip Seeds', kind: 'seed' },
  { id: 'potato_seed', label: 'Potato Seeds', kind: 'seed' },
  { id: 'cauliflower_seed', label: 'Cauliflower Seeds', kind: 'seed' },
];
