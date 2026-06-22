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
  | 'Prismatic'
  | 'Celestial';

export const RARITY_ORDER: Rarity[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Legendary',
  'Mythical',
  'Divine',
  'Prismatic',
  'Celestial',
];

export const RARITY: Record<
  Rarity,
  { color: number; css: string; glow: number; present: number; qty: [number, number] }
> = {
  // present = chance the shop stocks it on a restock; qty = stock range when it does
  Common: { color: 0xc3ccd4, css: '#c3ccd4', glow: 0x9aa4ad, present: 1.0, qty: [5, 11] },
  Uncommon: { color: 0x5fd35f, css: '#5fd35f', glow: 0x2e7d32, present: 0.9, qty: [3, 5] },
  Rare: { color: 0x4ea1ff, css: '#4ea1ff', glow: 0x1e5fae, present: 0.6, qty: [2, 3] },
  Legendary: { color: 0xffc23d, css: '#ffc23d', glow: 0xc8901a, present: 0.32, qty: [1, 2] },
  Mythical: { color: 0xb56bff, css: '#b56bff', glow: 0x7a2fd0, present: 0.14, qty: [1, 1] },
  Divine: { color: 0xff5d5d, css: '#ff5d5d', glow: 0xc02020, present: 0.06, qty: [1, 1] },
  Prismatic: { color: 0xff8ad8, css: '#ff8ad8', glow: 0xff66cc, present: 0.02, qty: [1, 1] },
  Celestial: { color: 0x9fe8ff, css: '#9fe8ff', glow: 0x6fd8ff, present: 0.009, qty: [1, 1] },
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
  cropTint?: number; // optional base tint of the crop sprite (for palette variants)
  // If set, the crop REGROWS this many seconds after harvest instead of being
  // removed (multi-harvest). ~50% of growthSeconds keeps the follow-up cycle snappy.
  regrow?: number;
};

// Roster mapped to the premium "Farming Plants" sprite rows (r2..r14), tiered
// into the rarity ladder so leveling unlocks progressively fancier crops.
export const PLANTS: Plant[] = [
  // Common
  { id: 'carrot', name: 'Carrot', rarity: 'Common', seedCost: 5, baseValue: 9, growthSeconds: 22, cropRow: 2, color: 0xe8862b },
  { id: 'spinach', name: 'Spinach', rarity: 'Common', seedCost: 6, baseValue: 13, growthSeconds: 25, cropRow: 1, color: 0x6fbf3a },
  { id: 'lettuce', name: 'Lettuce', rarity: 'Common', seedCost: 8, baseValue: 16, growthSeconds: 28, cropRow: 7, color: 0x86c34a },
  { id: 'turnip', name: 'Turnip', rarity: 'Common', seedCost: 10, baseValue: 21, growthSeconds: 32, cropRow: 10, color: 0xe7dcc0 },
  // Uncommon
  { id: 'tomato', name: 'Tomato', rarity: 'Uncommon', seedCost: 18, baseValue: 39, growthSeconds: 42, cropRow: 4, color: 0xe2402c, regrow: 22 },
  { id: 'cauliflower', name: 'Cauliflower', rarity: 'Uncommon', seedCost: 23, baseValue: 50, growthSeconds: 47, cropRow: 3, color: 0xeae3c8 },
  { id: 'eggplant', name: 'Eggplant', rarity: 'Uncommon', seedCost: 28, baseValue: 62, growthSeconds: 52, cropRow: 5, color: 0x7a3fb0, regrow: 26 },
  // Rare
  { id: 'beet', name: 'Beetroot', rarity: 'Rare', seedCost: 43, baseValue: 98, growthSeconds: 64, cropRow: 12, color: 0x8e2f6a },
  { id: 'cucumber', name: 'Cucumber', rarity: 'Rare', seedCost: 60, baseValue: 141, growthSeconds: 78, cropRow: 14, color: 0x4fae4a, regrow: 34 },
  // Legendary
  { id: 'corn', name: 'Corn', rarity: 'Legendary', seedCost: 105, baseValue: 280, growthSeconds: 104, cropRow: 8, color: 0xf4c948 },
  { id: 'pumpkin', name: 'Pumpkin', rarity: 'Legendary', seedCost: 150, baseValue: 410, growthSeconds: 124, cropRow: 9, color: 0xe8862b },
  // Mythical
  { id: 'pinkcabbage', name: 'Pink Cabbage', rarity: 'Mythical', seedCost: 280, baseValue: 825, growthSeconds: 158, cropRow: 11, color: 0xe06aa0 },
  { id: 'goldencorn', name: 'Golden Corn', rarity: 'Mythical', seedCost: 410, baseValue: 1250, growthSeconds: 172, cropRow: 8, color: 0xffd84a, cropTint: 0xffc400 },
  // Divine
  { id: 'bluerose', name: 'Blue Rose', rarity: 'Divine', seedCost: 675, baseValue: 2600, growthSeconds: 205, cropRow: 6, color: 0x5aa0e0 },
  { id: 'frostpumpkin', name: 'Frost Pumpkin', rarity: 'Divine', seedCost: 1050, baseValue: 4100, growthSeconds: 230, cropRow: 9, color: 0x9fd6ff, cropTint: 0x8fd0ff },
  // Prismatic
  { id: 'starfruit', name: 'Star Fruit', rarity: 'Prismatic', seedCost: 1900, baseValue: 8250, growthSeconds: 255, cropRow: 13, color: 0x6ad0e0 },
  { id: 'moonpetal', name: 'Moonpetal', rarity: 'Prismatic', seedCost: 3200, baseValue: 15000, growthSeconds: 285, cropRow: 6, color: 0xfff0c0, cropTint: 0xf3e9c8 },
  // Celestial
  { id: 'galaxyfruit', name: 'Galaxy Fruit', rarity: 'Celestial', seedCost: 6500, baseValue: 32000, growthSeconds: 330, cropRow: 13, color: 0xb98aff, cropTint: 0xc6a3ff },
  { id: 'voidbloom', name: 'Voidbloom', rarity: 'Celestial', seedCost: 13000, baseValue: 72500, growthSeconds: 400, cropRow: 11, color: 0x8a4fd0, cropTint: 0x9a6ad0 },
];

export const PLANT_BY_ID: Record<string, Plant> = Object.fromEntries(
  PLANTS.map((p) => [p.id, p]),
);

export function rarityRank(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

// Player level at which each rarity tier becomes available in the shop. Re-tuned
// to spread unlocks more evenly across the mid-game: the old curve front-loaded
// the early tiers then left long dead zones (Legendary→Divine→Celestial spanned
// ~6/8/8 levels with nothing new). The steps below climb steadily (≈+5/level) so
// there's a fresh tier to chase roughly every five levels through Lv 30.
export const RARITY_UNLOCK: Record<Rarity, number> = {
  Common: 1,
  Uncommon: 3,
  Rare: 7,
  Legendary: 11,
  Mythical: 15,
  Divine: 20,
  Prismatic: 25,
  Celestial: 30,
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

// Dialled down (both odds + multipliers) to slow the economy — mutations now add
// ~1.4x on average (was ~2.4x), and a mutation lands on ~15% of harvests (was ~22%).
export const MUTATIONS: Mutation[] = [
  { id: 'normal', name: 'Normal', mult: 1, weight: 100, tint: null, css: '#cfd6dd' },
  { id: 'shiny', name: 'Shiny', mult: 1.5, weight: 12, tint: 0xfff6c2, css: '#ffe98a' },
  { id: 'frosted', name: 'Frosted', mult: 4, weight: 4, tint: 0xbdecff, css: '#bdecff' },
  { id: 'aurora', name: 'Aurora', mult: 6, weight: 3, tint: 0x66ffcc, css: '#66ffcc' },
  { id: 'gold', name: 'Gold', mult: 10, weight: 2, tint: 0xffd21a, css: '#ffd21a' },
  { id: 'rainbow', name: 'Rainbow', mult: 25, weight: 0.5, tint: 0xffffff, rainbow: true, css: '#ff7ad0' },
];

export const MUTATION_BY_ID: Record<string, Mutation> = Object.fromEntries(
  MUTATIONS.map((m) => [m.id, m]),
);

const MUT_TOTAL = MUTATIONS.reduce((s, m) => s + m.weight, 0);

// Top-tier mutations the Fortune "Jackpot" fork specifically biases toward.
const TOP_MUTATIONS = new Set(['gold', 'rainbow']);

// `luck` (>=1) scales up the odds of non-normal mutations (the Fortune upgrade).
// `topLuck` (>=1) applies an EXTRA multiplier to just the top mutations
// (Gold/Rainbow) — the Fortune "Jackpot" fork — so it skews toward the jackpots
// rather than lifting every tier evenly.
export function pickMutation(luck = 1, topLuck = 1): Mutation {
  if (luck <= 1 && topLuck <= 1) {
    let r = Math.random() * MUT_TOTAL;
    for (const m of MUTATIONS) {
      r -= m.weight;
      if (r <= 0) return m;
    }
    return MUTATIONS[0];
  }
  const weights = MUTATIONS.map((m) => {
    if (m.id === 'normal') return m.weight;
    return m.weight * luck * (TOP_MUTATIONS.has(m.id) ? topLuck : 1);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < MUTATIONS.length; i++) {
    r -= weights[i];
    if (r <= 0) return MUTATIONS[i];
  }
  return MUTATIONS[0];
}

// ---- quality stars ------------------------------------------------------

// Every harvest rolls a quality tier that multiplies its value (orthogonal to
// mutations). Better odds come from the Fertilizer upgrade + Farming skill via
// the `luck` arg to rollQuality().
export type Quality = 'none' | 'silver' | 'gold' | 'iridium';

export const QUALITY: Record<Quality, { mult: number; label: string; stars: number; css: string }> = {
  none: { mult: 1, label: '', stars: 0, css: '#cfd6dd' },
  silver: { mult: 1.25, label: 'Silver', stars: 1, css: '#c9d2db' },
  gold: { mult: 1.5, label: 'Gold', stars: 2, css: '#ffd21a' },
  iridium: { mult: 2, label: 'Iridium', stars: 3, css: '#b98aff' },
};

// Base odds ≈ none 80% / silver 14% / gold 5% / iridium 1%. `luck` (>1) scales
// the non-none weights toward the higher tiers (mirrors pickMutation).
const QUALITY_WEIGHTS: { q: Quality; w: number }[] = [
  { q: 'none', w: 80 },
  { q: 'silver', w: 14 },
  { q: 'gold', w: 5 },
  { q: 'iridium', w: 1 },
];

export function rollQuality(luck = 1): Quality {
  const weights = QUALITY_WEIGHTS.map((e) => (e.q === 'none' ? e.w : e.w * luck));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < QUALITY_WEIGHTS.length; i++) {
    r -= weights[i];
    if (r <= 0) return QUALITY_WEIGHTS[i].q;
  }
  return 'none';
}

// ---- value + shop -------------------------------------------------------

export function cropValue(
  plant: Plant,
  mutation: Mutation,
  wet: boolean,
  quality: Quality = 'none',
  withered = false,
): number {
  return Math.round(
    plant.baseValue * mutation.mult * (wet ? 1.5 : 1) * QUALITY[quality].mult * (withered ? 0.4 : 1),
  );
}


// A tiny deterministic PRNG (mulberry32). Seeded so every client computes the
// SAME shop for a given island + restock window — that's what makes the shop
// shared per island without a server.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Roll the SHARED island seed-shop stock for a given (island, restock window).
// Deterministic (seeded PRNG, not Math.random) so every player on the island
// sees identical stock, and each tier's quantity is multiplied by the number of
// players online — the shared pool (10 players ⇒ 10× stock, drained by everyone
// on the island). Purely RARITY-based with NO level gating: commons in bulk down
// to the occasional lone Celestial; the seed PRICE is the only gate.
export function rollShopAt(island: number, window: number, players = 1): Record<string, number> {
  const count = Math.max(1, Math.floor(players));
  const rand = mulberry32(((island | 0) * 0x9e3779b1) ^ ((window | 0) * 0x85ebca77));
  const stock: Record<string, number> = {};
  for (const p of PLANTS) {
    const r = RARITY[p.rarity];
    // Draw present-roll then qty-roll for EVERY plant in order so the stream
    // stays aligned across clients regardless of outcomes.
    const present = rand() < r.present;
    const qty = r.qty[0] + Math.floor(rand() * (r.qty[1] - r.qty[0] + 1));
    stock[p.id] = present ? qty * count : 0;
  }
  return stock;
}

// Stable harvest-stack key so identical (plant + mutation + wet + quality +
// withered) items stack. Format: "plantId|mutId|wet|quality|withered" with wet &
// withered as '0'/'1'. Legacy 3- and 4-part keys remain parseable (see below).
export function stackKey(
  plantId: string,
  mutationId: string,
  wet: boolean,
  quality: Quality = 'none',
  withered = false,
): string {
  return `${plantId}|${mutationId}|${wet ? 1 : 0}|${quality}|${withered ? 1 : 0}`;
}

export function parseStackKey(
  key: string,
): { plant: Plant; mutation: Mutation; wet: boolean; quality: Quality; withered: boolean } {
  // Tolerant of legacy 3-part (no quality/withered) and 4-part keys.
  const [plantId, mutationId, wet, q = 'none', wth = '0'] = key.split('|');
  return {
    plant: PLANT_BY_ID[plantId],
    mutation: MUTATION_BY_ID[mutationId],
    wet: wet === '1',
    quality: (q as Quality) in QUALITY ? (q as Quality) : 'none',
    withered: wth === '1',
  };
}
