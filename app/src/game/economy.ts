// Economy model: rarity tiers, plants, and mutations — inspired by "Grow a
// Garden": cheap commons up to ultra-rare prismatics, plus harvest mutations
// (Gold/Rainbow/...) that multiply value. Tuned so chasing rare seeds and
// lucky mutations is the core money loop.

export type Rarity =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Legendary'
  | 'Mythical'
  | 'Divine'
  | 'Prismatic';

export const RARITY_ORDER: Rarity[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Legendary',
  'Mythical',
  'Divine',
  'Prismatic',
];

export const RARITY: Record<
  Rarity,
  { color: number; css: string; glow: number; present: number; qty: [number, number] }
> = {
  // present = chance the shop stocks it on a restock; qty = stock range when it does
  Common: { color: 0xc3ccd4, css: '#c3ccd4', glow: 0x9aa4ad, present: 1.0, qty: [10, 22] },
  Uncommon: { color: 0x5fd35f, css: '#5fd35f', glow: 0x2e7d32, present: 0.9, qty: [5, 10] },
  Rare: { color: 0x4ea1ff, css: '#4ea1ff', glow: 0x1e5fae, present: 0.6, qty: [3, 6] },
  Legendary: { color: 0xffc23d, css: '#ffc23d', glow: 0xc8901a, present: 0.32, qty: [2, 4] },
  Mythical: { color: 0xb56bff, css: '#b56bff', glow: 0x7a2fd0, present: 0.14, qty: [1, 2] },
  Divine: { color: 0xff5d5d, css: '#ff5d5d', glow: 0xc02020, present: 0.06, qty: [1, 1] },
  Prismatic: { color: 0xff8ad8, css: '#ff8ad8', glow: 0xff66cc, present: 0.018, qty: [1, 1] },
};

export type Plant = {
  id: string;
  name: string;
  rarity: Rarity;
  seedCost: number;
  baseValue: number;
  growthSeconds: number;
  cropRow: number; // row in the Sprout Lands "Farming Plants" sheet (5 stages/row)
  color: number; // glow / particle tint
};

// Roster mapped to the premium "Farming Plants" sprite rows (r2..r14), tiered
// into the rarity ladder so leveling unlocks progressively fancier crops.
export const PLANTS: Plant[] = [
  // Common
  { id: 'carrot', name: 'Carrot', rarity: 'Common', seedCost: 10, baseValue: 18, growthSeconds: 24, cropRow: 2, color: 0xe8862b },
  { id: 'lettuce', name: 'Lettuce', rarity: 'Common', seedCost: 13, baseValue: 24, growthSeconds: 27, cropRow: 7, color: 0x86c34a },
  { id: 'turnip', name: 'Turnip', rarity: 'Common', seedCost: 16, baseValue: 32, growthSeconds: 30, cropRow: 10, color: 0xe7dcc0 },
  // Uncommon
  { id: 'tomato', name: 'Tomato', rarity: 'Uncommon', seedCost: 35, baseValue: 70, growthSeconds: 42, cropRow: 4, color: 0xe2402c },
  { id: 'cauliflower', name: 'Cauliflower', rarity: 'Uncommon', seedCost: 42, baseValue: 84, growthSeconds: 46, cropRow: 3, color: 0xeae3c8 },
  { id: 'eggplant', name: 'Eggplant', rarity: 'Uncommon', seedCost: 50, baseValue: 104, growthSeconds: 50, cropRow: 5, color: 0x7a3fb0 },
  // Rare
  { id: 'beet', name: 'Beetroot', rarity: 'Rare', seedCost: 80, baseValue: 175, growthSeconds: 66, cropRow: 12, color: 0x8e2f6a },
  { id: 'cucumber', name: 'Cucumber', rarity: 'Rare', seedCost: 110, baseValue: 250, growthSeconds: 80, cropRow: 14, color: 0x4fae4a },
  // Legendary
  { id: 'corn', name: 'Corn', rarity: 'Legendary', seedCost: 200, baseValue: 520, growthSeconds: 110, cropRow: 8, color: 0xf4c948 },
  { id: 'pumpkin', name: 'Pumpkin', rarity: 'Legendary', seedCost: 280, baseValue: 720, growthSeconds: 130, cropRow: 9, color: 0xe8862b },
  // Mythical
  { id: 'pinkcabbage', name: 'Pink Cabbage', rarity: 'Mythical', seedCost: 520, baseValue: 1500, growthSeconds: 165, cropRow: 11, color: 0xe06aa0 },
  // Divine
  { id: 'bluerose', name: 'Blue Rose', rarity: 'Divine', seedCost: 1300, baseValue: 4800, growthSeconds: 220, cropRow: 6, color: 0x5aa0e0 },
  // Prismatic
  { id: 'starfruit', name: 'Star Fruit', rarity: 'Prismatic', seedCost: 3600, baseValue: 16000, growthSeconds: 300, cropRow: 13, color: 0x6ad0e0 },
];

export const PLANT_BY_ID: Record<string, Plant> = Object.fromEntries(
  PLANTS.map((p) => [p.id, p]),
);

export function rarityRank(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

// Player level at which each rarity tier becomes available in the shop.
export const RARITY_UNLOCK: Record<Rarity, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 5,
  Legendary: 9,
  Mythical: 14,
  Divine: 20,
  Prismatic: 28,
};

// ---- mutations ----------------------------------------------------------

export type Mutation = {
  id: string;
  name: string;
  mult: number;
  weight: number; // relative chance at harvest
  tint: number | null; // sprite tint (null = use plant colors); 'rainbow' animates
  rainbow?: boolean;
  css: string;
};

export const MUTATIONS: Mutation[] = [
  { id: 'normal', name: 'Normal', mult: 1, weight: 100, tint: null, css: '#cfd6dd' },
  { id: 'shiny', name: 'Shiny', mult: 2, weight: 18, tint: 0xfff6c2, css: '#ffe98a' },
  { id: 'frosted', name: 'Frosted', mult: 8, weight: 6, tint: 0xbdecff, css: '#bdecff' },
  { id: 'gold', name: 'Gold', mult: 20, weight: 4, tint: 0xffd21a, css: '#ffd21a' },
  { id: 'rainbow', name: 'Rainbow', mult: 50, weight: 1, tint: 0xffffff, rainbow: true, css: '#ff7ad0' },
];

export const MUTATION_BY_ID: Record<string, Mutation> = Object.fromEntries(
  MUTATIONS.map((m) => [m.id, m]),
);

const MUT_TOTAL = MUTATIONS.reduce((s, m) => s + m.weight, 0);

// `luck` (>=1) scales up the odds of non-normal mutations (the Fortune upgrade).
export function pickMutation(luck = 1): Mutation {
  if (luck <= 1) {
    let r = Math.random() * MUT_TOTAL;
    for (const m of MUTATIONS) {
      r -= m.weight;
      if (r <= 0) return m;
    }
    return MUTATIONS[0];
  }
  const weights = MUTATIONS.map((m) => (m.id === 'normal' ? m.weight : m.weight * luck));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < MUTATIONS.length; i++) {
    r -= weights[i];
    if (r <= 0) return MUTATIONS[i];
  }
  return MUTATIONS[0];
}

// ---- value + shop -------------------------------------------------------

export function cropValue(plant: Plant, mutation: Mutation, wet: boolean): number {
  return Math.round(plant.baseValue * mutation.mult * (wet ? 1.5 : 1));
}

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Roll a fresh shop stock map (plantId -> count). Commons always present;
// rarer tiers appear with decreasing probability — that's the "wait for the
// rare restock" chase.
export function rollShop(level = 99): Record<string, number> {
  const stock: Record<string, number> = {};
  for (const p of PLANTS) {
    if (RARITY_UNLOCK[p.rarity] > level) {
      stock[p.id] = 0; // tier not unlocked yet
      continue;
    }
    const r = RARITY[p.rarity];
    stock[p.id] = Math.random() < r.present ? randInt(r.qty[0], r.qty[1]) : 0;
  }
  return stock;
}

// Stable harvest-stack key so identical (plant + mutation + wet) items stack.
export function stackKey(plantId: string, mutationId: string, wet: boolean): string {
  return `${plantId}|${mutationId}|${wet ? 1 : 0}`;
}

export function parseStackKey(key: string): { plant: Plant; mutation: Mutation; wet: boolean } {
  const [plantId, mutationId, wet] = key.split('|');
  return { plant: PLANT_BY_ID[plantId], mutation: MUTATION_BY_ID[mutationId], wet: wet === '1' };
}
