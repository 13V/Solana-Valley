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

export type Shape = 'root' | 'berry' | 'round' | 'leafy' | 'giant' | 'star' | 'flower';

export type Plant = {
  id: string;
  name: string;
  rarity: Rarity;
  seedCost: number;
  baseValue: number;
  growthSeconds: number;
  fruit: number; // primary fruit color
  leaf: number; // foliage color
  shape: Shape;
};

export const PLANTS: Plant[] = [
  { id: 'carrot', name: 'Carrot', rarity: 'Common', seedCost: 10, baseValue: 18, growthSeconds: 24, fruit: 0xe8862b, leaf: 0x4caf50, shape: 'root' },
  { id: 'parsnip', name: 'Parsnip', rarity: 'Common', seedCost: 12, baseValue: 24, growthSeconds: 26, fruit: 0xe8d8a0, leaf: 0x4caf50, shape: 'root' },
  { id: 'potato', name: 'Potato', rarity: 'Common', seedCost: 16, baseValue: 32, growthSeconds: 30, fruit: 0xc89b5c, leaf: 0x4caf50, shape: 'round' },
  { id: 'cabbage', name: 'Cabbage', rarity: 'Common', seedCost: 20, baseValue: 40, growthSeconds: 34, fruit: 0x86c34a, leaf: 0x4d9a3c, shape: 'leafy' },
  { id: 'strawberry', name: 'Strawberry', rarity: 'Uncommon', seedCost: 35, baseValue: 70, growthSeconds: 42, fruit: 0xe23b4e, leaf: 0x3f9a3f, shape: 'berry' },
  { id: 'blueberry', name: 'Blueberry', rarity: 'Uncommon', seedCost: 42, baseValue: 86, growthSeconds: 46, fruit: 0x4f7ad6, leaf: 0x3f9a3f, shape: 'berry' },
  { id: 'tomato', name: 'Tomato', rarity: 'Uncommon', seedCost: 50, baseValue: 104, growthSeconds: 52, fruit: 0xe44b34, leaf: 0x3f9a3f, shape: 'round' },
  { id: 'corn', name: 'Corn', rarity: 'Rare', seedCost: 80, baseValue: 175, growthSeconds: 68, fruit: 0xf4c948, leaf: 0x4d9a3c, shape: 'leafy' },
  { id: 'pumpkin', name: 'Pumpkin', rarity: 'Rare', seedCost: 105, baseValue: 235, growthSeconds: 82, fruit: 0xe8862b, leaf: 0x4d9a3c, shape: 'giant' },
  { id: 'watermelon', name: 'Watermelon', rarity: 'Rare', seedCost: 130, baseValue: 300, growthSeconds: 92, fruit: 0x3fae5a, leaf: 0x4d9a3c, shape: 'giant' },
  { id: 'pineapple', name: 'Pineapple', rarity: 'Legendary', seedCost: 230, baseValue: 560, growthSeconds: 118, fruit: 0xf2c14e, leaf: 0x3f9a3f, shape: 'leafy' },
  { id: 'dragonfruit', name: 'Dragon Fruit', rarity: 'Legendary', seedCost: 300, baseValue: 760, growthSeconds: 138, fruit: 0xe0457b, leaf: 0x53b06a, shape: 'berry' },
  { id: 'mango', name: 'Mango', rarity: 'Mythical', seedCost: 520, baseValue: 1500, growthSeconds: 168, fruit: 0xf6a323, leaf: 0x3f9a3f, shape: 'round' },
  { id: 'starfruit', name: 'Star Fruit', rarity: 'Mythical', seedCost: 700, baseValue: 2100, growthSeconds: 188, fruit: 0xf4e04a, leaf: 0x3f9a3f, shape: 'star' },
  { id: 'goldenapple', name: 'Golden Apple', rarity: 'Divine', seedCost: 1400, baseValue: 5000, growthSeconds: 224, fruit: 0xffd23d, leaf: 0x3f9a3f, shape: 'round' },
  { id: 'celestial', name: 'Celestial Bloom', rarity: 'Prismatic', seedCost: 3600, baseValue: 16000, growthSeconds: 300, fruit: 0xff7ad0, leaf: 0x5ad0c0, shape: 'flower' },
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
