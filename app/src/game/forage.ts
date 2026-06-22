// Foraging: wild finds you gather from the world (mushrooms, berries, herbs).
// Forageable nodes spawn on open grass and respawn over time; gathering one
// awards coins + Foraging XP, and the skill's luck tilts toward rarer finds.
// Standalone data/logic — FarmScene spawns the nodes and runs the gather.

export type Forage = {
  id: string;
  name: string;
  value: number;
  weight: number; // relative find chance at luck 1
  sheet: string; // texture key to draw the node
  frame: number; // frame within the sheet
  css: string;
};

// Ordered common → rare. Frames reference the already-loaded 'mfs' (mushrooms/
// flowers/stones) and 'nature' (berry bushes) sheets.
export const FORAGE: Forage[] = [
  { id: 'mushroom', name: 'Wild Mushroom', value: 18, weight: 100, sheet: 'mfs', frame: 0, css: '#d6a06a' },
  { id: 'berries', name: 'Wild Berries', value: 40, weight: 60, sheet: 'nature', frame: 37, css: '#e2402c' },
  { id: 'snowdrop', name: 'Snowdrop', value: 60, weight: 22, sheet: 'mfs', frame: 6, css: '#dff0ff' },
  { id: 'herb', name: 'Healing Herb', value: 85, weight: 30, sheet: 'mfs', frame: 12, css: '#86c34a' },
  { id: 'blueberries', name: 'Moonberries', value: 180, weight: 13, sheet: 'nature', frame: 40, css: '#4ea1ff' },
  { id: 'crystal', name: 'Crystal Shard', value: 420, weight: 5, sheet: 'mfs', frame: 25, css: '#b56bff' },
  { id: 'geode', name: 'Amber Geode', value: 650, weight: 3.5, sheet: 'mfs', frame: 15, css: '#ffb347' },
  { id: 'goldcap', name: 'Golden Truffle', value: 1100, weight: 1.5, sheet: 'mfs', frame: 3, css: '#ffd21a' },
  // --- Drop 15: Wild Bounty ---
  { id: 'nfg_pebblecap', name: 'Pebblecap Mushroom', value: 25, weight: 90, sheet: 'mfs', frame: 1, css: '#c8a87a' },
  { id: 'nfg_cloverbloom', name: 'Cloverbloom', value: 40, weight: 75, sheet: 'nature', frame: 36, css: '#7ec87e' },
  { id: 'nfg_duskshroom', name: 'Duskshroom', value: 70, weight: 55, sheet: 'mfs', frame: 4, css: '#9b7fc4' },
  { id: 'nfg_sunpetal', name: 'Sunpetal Bloom', value: 110, weight: 38, sheet: 'nature', frame: 38, css: '#f5c842' },
  { id: 'nfg_ironflint', name: 'Ironflint Stone', value: 175, weight: 22, sheet: 'mfs', frame: 8, css: '#8a9aaa' },
  { id: 'nfg_ghostbell', name: 'Ghostbell Flower', value: 300, weight: 10, sheet: 'mfs', frame: 13, css: '#d0eeff' },
  { id: 'nfg_crimsonwort', name: 'Crimsonwort Herb', value: 550, weight: 5, sheet: 'nature', frame: 41, css: '#c94040' },
  { id: 'nfg_voidcrystal', name: 'Voidcrystal Shard', value: 1000, weight: 1.5, sheet: 'mfs', frame: 17, css: '#6a3dff' },
  // --- Wave 2: more wild finds ---
  { id: 'nfg2_speckled_cap', name: 'Speckled Cap', value: 30, weight: 85, sheet: 'mfs', frame: 2, css: '#c8a97e' },
  { id: 'nfg2_dusk_petal', name: 'Dusk Petal', value: 75, weight: 60, sheet: 'mfs', frame: 5, css: '#d97fbf' },
  { id: 'nfg2_mossy_cobble', name: 'Mossy Cobble', value: 140, weight: 35, sheet: 'mfs', frame: 7, css: '#7ab87a' },
  { id: 'nfg2_glimmer_shard', name: 'Glimmer Shard', value: 310, weight: 18, sheet: 'mfs', frame: 9, css: '#a8c5ff' },
  { id: 'nfg2_ember_bloom', name: 'Ember Bloom', value: 560, weight: 7, sheet: 'mfs', frame: 10, css: '#e8824a' },
  { id: 'nfg2_voidheart_gem', name: 'Voidheart Gem', value: 900, weight: 2, sheet: 'mfs', frame: 11, css: '#8b52cc' },
];

// Pick a forage type; `luck` (>=1, from the Foraging skill) favours rarer finds.
export function pickForage(luck = 1): Forage {
  const weights = FORAGE.map((f, i) => f.weight * (1 + (luck - 1) * i * 0.35));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < FORAGE.length; i++) {
    r -= weights[i];
    if (r <= 0) return FORAGE[i];
  }
  return FORAGE[0];
}

export function forageXp(f: Forage): number {
  return Math.max(3, Math.round(Math.sqrt(f.value) * 1.1));
}
