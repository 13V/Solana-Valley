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
  { id: 'potato', name: 'Potato', rarity: 'Common', seedCost: 7, baseValue: 12, growthSeconds: 24, cropRow: 10, color: 0xc69a6a, cropTint: 0xc99a5e },
  { id: 'radish', name: 'Radish', rarity: 'Common', seedCost: 9, baseValue: 18, growthSeconds: 27, cropRow: 12, color: 0xff5a6a, cropTint: 0xff6a7a },
  // Uncommon
  { id: 'tomato', name: 'Tomato', rarity: 'Uncommon', seedCost: 18, baseValue: 39, growthSeconds: 42, cropRow: 4, color: 0xe2402c, regrow: 22 },
  { id: 'cauliflower', name: 'Cauliflower', rarity: 'Uncommon', seedCost: 23, baseValue: 50, growthSeconds: 47, cropRow: 3, color: 0xeae3c8 },
  { id: 'eggplant', name: 'Eggplant', rarity: 'Uncommon', seedCost: 28, baseValue: 62, growthSeconds: 52, cropRow: 5, color: 0x7a3fb0, regrow: 26 },
  { id: 'strawberry', name: 'Strawberry', rarity: 'Uncommon', seedCost: 20, baseValue: 44, growthSeconds: 40, cropRow: 4, color: 0xff4d6d, cropTint: 0xff5d7a, regrow: 20 },
  // Rare
  { id: 'beet', name: 'Beetroot', rarity: 'Rare', seedCost: 43, baseValue: 98, growthSeconds: 64, cropRow: 12, color: 0x8e2f6a },
  { id: 'cucumber', name: 'Cucumber', rarity: 'Rare', seedCost: 60, baseValue: 141, growthSeconds: 78, cropRow: 14, color: 0x4fae4a, regrow: 34 },
  { id: 'watermelon', name: 'Watermelon', rarity: 'Rare', seedCost: 50, baseValue: 125, growthSeconds: 72, cropRow: 14, color: 0x3aa54a, cropTint: 0x4caf50, regrow: 36 },
  // Legendary
  { id: 'corn', name: 'Corn', rarity: 'Legendary', seedCost: 105, baseValue: 280, growthSeconds: 104, cropRow: 8, color: 0xf4c948 },
  { id: 'pumpkin', name: 'Pumpkin', rarity: 'Legendary', seedCost: 150, baseValue: 410, growthSeconds: 124, cropRow: 9, color: 0xe8862b },
  { id: 'dragonfruit', name: 'Dragonfruit', rarity: 'Legendary', seedCost: 125, baseValue: 320, growthSeconds: 110, cropRow: 11, color: 0xff3d7f, cropTint: 0xff4d8f },
  // Mythical
  { id: 'pinkcabbage', name: 'Pink Cabbage', rarity: 'Mythical', seedCost: 280, baseValue: 825, growthSeconds: 158, cropRow: 11, color: 0xe06aa0 },
  { id: 'goldencorn', name: 'Golden Corn', rarity: 'Mythical', seedCost: 410, baseValue: 1250, growthSeconds: 172, cropRow: 8, color: 0xffd84a, cropTint: 0xffc400 },
  // Divine
  { id: 'bluerose', name: 'Blue Rose', rarity: 'Divine', seedCost: 675, baseValue: 2600, growthSeconds: 205, cropRow: 6, color: 0x5aa0e0 },
  { id: 'frostpumpkin', name: 'Frost Pumpkin', rarity: 'Divine', seedCost: 1050, baseValue: 4100, growthSeconds: 230, cropRow: 9, color: 0x9fd6ff, cropTint: 0x8fd0ff },
  { id: 'sunpetal', name: 'Sunpetal', rarity: 'Divine', seedCost: 800, baseValue: 3200, growthSeconds: 215, cropRow: 6, color: 0xffc24a, cropTint: 0xffcf5a },
  // Prismatic
  { id: 'starfruit', name: 'Star Fruit', rarity: 'Prismatic', seedCost: 1900, baseValue: 8250, growthSeconds: 255, cropRow: 13, color: 0x6ad0e0 },
  { id: 'moonpetal', name: 'Moonpetal', rarity: 'Prismatic', seedCost: 3200, baseValue: 15000, growthSeconds: 285, cropRow: 6, color: 0xfff0c0, cropTint: 0xf3e9c8 },
  { id: 'nebula', name: 'Nebula Bloom', rarity: 'Prismatic', seedCost: 2400, baseValue: 11000, growthSeconds: 270, cropRow: 13, color: 0x9a6aff, cropTint: 0xa97aff },
  // Celestial
  { id: 'galaxyfruit', name: 'Galaxy Fruit', rarity: 'Celestial', seedCost: 6500, baseValue: 32000, growthSeconds: 330, cropRow: 13, color: 0xb98aff, cropTint: 0xc6a3ff },
  { id: 'voidbloom', name: 'Voidbloom', rarity: 'Celestial', seedCost: 13000, baseValue: 72500, growthSeconds: 400, cropRow: 11, color: 0x8a4fd0, cropTint: 0x9a6ad0 },
  // --- Drop 12: Tropical Fruits & Garden Flowers ---
  { id: 'trop_mango_gold', name: 'Golden Mango', rarity: 'Rare', seedCost: 48, baseValue: 115, growthSeconds: 70, cropRow: 1, color: 0xffd700, cropTint: 0xffa500, regrow: 35 },
  { id: 'trop_papaya_sunset', name: 'Sunset Papaya', rarity: 'Rare', seedCost: 52, baseValue: 128, growthSeconds: 75, cropRow: 2, color: 0xff6347, cropTint: 0xff8c00, regrow: 38 },
  { id: 'trop_guava_emerald', name: 'Emerald Guava', rarity: 'Uncommon', seedCost: 28, baseValue: 65, growthSeconds: 45, cropRow: 3, color: 0x32cd32, cropTint: 0x228b22, regrow: 22 },
  { id: 'trop_passionfruit_royal', name: 'Royal Passionfruit', rarity: 'Legendary', seedCost: 125, baseValue: 340, growthSeconds: 115, cropRow: 4, color: 0x8b008b, cropTint: 0xb01060, regrow: 58 },
  { id: 'trop_rambutan_crimson', name: 'Crimson Rambutan', rarity: 'Legendary', seedCost: 140, baseValue: 385, growthSeconds: 120, cropRow: 5, color: 0xdc143c, cropTint: 0xff4500, regrow: 60 },
  { id: 'trop_jackfruit_amber', name: 'Amber Jackfruit', rarity: 'Mythical', seedCost: 320, baseValue: 950, growthSeconds: 165, cropRow: 6, color: 0xffb347, cropTint: 0xff8c00, regrow: 83 },
  { id: 'trop_soursop_moonlight', name: 'Moonlight Soursop', rarity: 'Mythical', seedCost: 380, baseValue: 1100, growthSeconds: 170, cropRow: 7, color: 0xe0ffff, cropTint: 0x9fe0d0, regrow: 85 },
  { id: 'flwr_crimson_tulip', name: 'Crimson Tulip', rarity: 'Rare', seedCost: 48, baseValue: 110, growthSeconds: 68, cropRow: 2, color: 0xdc143c, cropTint: 0xff1744 },
  { id: 'flwr_golden_sunflower', name: 'Golden Sunflower', rarity: 'Rare', seedCost: 55, baseValue: 128, growthSeconds: 75, cropRow: 3, color: 0xffd700, cropTint: 0xffc300 },
  { id: 'flwr_midnight_orchid', name: 'Midnight Orchid', rarity: 'Legendary', seedCost: 125, baseValue: 315, growthSeconds: 112, cropRow: 5, color: 0x2d1b4e, cropTint: 0x8a4bd0 },
  { id: 'flwr_celestial_lotus', name: 'Celestial Lotus', rarity: 'Legendary', seedCost: 142, baseValue: 380, growthSeconds: 118, cropRow: 6, color: 0xe0b0ff, cropTint: 0x9d4edd },
  { id: 'flwr_royal_peony', name: 'Royal Peony', rarity: 'Divine', seedCost: 820, baseValue: 3100, growthSeconds: 215, cropRow: 8, color: 0xff69b4, cropTint: 0xff1493 },
  { id: 'flwr_twilight_dahlia', name: 'Twilight Dahlia', rarity: 'Divine', seedCost: 950, baseValue: 3750, growthSeconds: 228, cropRow: 9, color: 0x8b008b, cropTint: 0xda70d6 },
  { id: 'flwr_sapphire_iris', name: 'Sapphire Iris', rarity: 'Legendary', seedCost: 115, baseValue: 290, growthSeconds: 105, cropRow: 4, color: 0x0a7ba1, cropTint: 0x00bfff },
  // --- Drop 11: Berries, Melons & Peppers ---
  { id: 'berry_crimson_raspberry', name: 'Crimson Raspberry', rarity: 'Uncommon', seedCost: 22, baseValue: 51, growthSeconds: 48, cropRow: 3, color: 0xff1493, cropTint: 0xc41e3a, regrow: 24 },
  { id: 'berry_shadow_blackberry', name: 'Shadow Blackberry', rarity: 'Uncommon', seedCost: 18, baseValue: 42, growthSeconds: 44, cropRow: 5, color: 0x2f1b3c, cropTint: 0x4a2d5e, regrow: 22 },
  { id: 'berry_golden_gooseberry', name: 'Golden Gooseberry', rarity: 'Uncommon', seedCost: 25, baseValue: 58, growthSeconds: 50, cropRow: 7, color: 0xffd700, cropTint: 0xf0e68c, regrow: 25 },
  { id: 'berry_scarlet_cranberry', name: 'Scarlet Cranberry', rarity: 'Rare', seedCost: 48, baseValue: 115, growthSeconds: 70, cropRow: 9, color: 0xdc143c, cropTint: 0xb01030, regrow: 35 },
  { id: 'berry_midnight_elderberry', name: 'Midnight Elderberry', rarity: 'Rare', seedCost: 55, baseValue: 128, growthSeconds: 75, cropRow: 11, color: 0x440055, cropTint: 0x5a2d6e, regrow: 37 },
  { id: 'berry_amethyst_currant', name: 'Amethyst Currant', rarity: 'Legendary', seedCost: 125, baseValue: 310, growthSeconds: 115, cropRow: 2, color: 0x9966cc, cropTint: 0x8a4db0, regrow: 57 },
  { id: 'berry_twilight_boysenberry', name: 'Twilight Boysenberry', rarity: 'Legendary', seedCost: 140, baseValue: 365, growthSeconds: 120, cropRow: 4, color: 0x663399, cropTint: 0x7a4bb0, regrow: 60 },
  { id: 'melon_cantaloupe', name: 'Sunburst Cantaloupe', rarity: 'Uncommon', seedCost: 18, baseValue: 42, growthSeconds: 45, cropRow: 3, color: 0xffd700, cropTint: 0xf4a460 },
  { id: 'melon_honeydew', name: 'Jade Honeydew', rarity: 'Uncommon', seedCost: 22, baseValue: 56, growthSeconds: 48, cropRow: 4, color: 0x90ee90, cropTint: 0xbcee68 },
  { id: 'melon_zucchini', name: 'Emerald Zucchini', rarity: 'Uncommon', seedCost: 20, baseValue: 50, growthSeconds: 42, cropRow: 5, color: 0x32cd32, cropTint: 0x228b22 },
  { id: 'melon_butternut', name: 'Amber Butternut Squash', rarity: 'Rare', seedCost: 48, baseValue: 115, growthSeconds: 70, cropRow: 6, color: 0xff8c00, cropTint: 0xd2691e },
  { id: 'melon_acorn', name: 'Obsidian Acorn Squash', rarity: 'Rare', seedCost: 56, baseValue: 132, growthSeconds: 75, cropRow: 7, color: 0x008b8b, cropTint: 0x3f6f6f },
  { id: 'melon_bottle', name: 'Crimson Bottle Gourd', rarity: 'Rare', seedCost: 50, baseValue: 108, growthSeconds: 65, cropRow: 8, color: 0xff1493, cropTint: 0xdc143c },
  { id: 'melon_winter', name: 'Prismatic Winter Melon', rarity: 'Legendary', seedCost: 128, baseValue: 340, growthSeconds: 115, cropRow: 9, color: 0x9370db, cropTint: 0x87ceeb },
  { id: 'pep_jalapeno', name: 'Jalapeño', rarity: 'Uncommon', seedCost: 16, baseValue: 38, growthSeconds: 45, cropRow: 2, color: 0x2d8016, cropTint: 0x22aa22, regrow: 22 },
  { id: 'pep_golden_bell', name: 'Golden Bell Pepper', rarity: 'Uncommon', seedCost: 22, baseValue: 52, growthSeconds: 48, cropRow: 3, color: 0xffd700, cropTint: 0xffa500, regrow: 24 },
  { id: 'pep_habanero_fire', name: 'Habanero Fire', rarity: 'Uncommon', seedCost: 28, baseValue: 61, growthSeconds: 51, cropRow: 4, color: 0xff6600, cropTint: 0xff4500, regrow: 25 },
  { id: 'pep_ghostly_specter', name: 'Ghostly Specter', rarity: 'Rare', seedCost: 48, baseValue: 118, growthSeconds: 68, cropRow: 7, color: 0xf5f5dc, cropTint: 0xf0ead0, regrow: 34 },
  { id: 'pep_midnight_eggplant', name: 'Midnight Eggplant', rarity: 'Rare', seedCost: 56, baseValue: 132, growthSeconds: 75, cropRow: 8, color: 0x663399, cropTint: 0x7a4bb0, regrow: 37 },
  { id: 'pep_cosmic_tomatillo', name: 'Cosmic Tomatillo', rarity: 'Legendary', seedCost: 128, baseValue: 347, growthSeconds: 115, cropRow: 11, color: 0x9d4edd, cropTint: 0x8a4bc0, regrow: 57 },
  { id: 'pep_infernal_nightshade', name: 'Infernal Nightshade', rarity: 'Legendary', seedCost: 142, baseValue: 398, growthSeconds: 122, cropRow: 12, color: 0xff1744, cropTint: 0xc41030, regrow: 61 },
  // --- Drop 10: Roots, Leafy Greens, Herbs & Grains ---
  { id: 'root_parsnip', name: 'Parsnip', rarity: 'Common', seedCost: 8, baseValue: 15, growthSeconds: 28, cropRow: 3, color: 0xf4e4c1, cropTint: 0xe8d4a0 },
  { id: 'root_golden_yam', name: 'Golden Yam', rarity: 'Common', seedCost: 6, baseValue: 12, growthSeconds: 26, cropRow: 4, color: 0xffb347, cropTint: 0xe69914 },
  { id: 'root_ginger', name: 'Ginger', rarity: 'Uncommon', seedCost: 22, baseValue: 48, growthSeconds: 47, cropRow: 5, color: 0xd2691e, cropTint: 0xb8540d },
  { id: 'root_purple_rutabaga', name: 'Purple Rutabaga', rarity: 'Uncommon', seedCost: 18, baseValue: 42, growthSeconds: 44, cropRow: 6, color: 0x9b5de5, cropTint: 0x7b3cb8 },
  { id: 'root_sweet_potato', name: 'Sweet Potato', rarity: 'Uncommon', seedCost: 25, baseValue: 55, growthSeconds: 51, cropRow: 7, color: 0xd97e3d, cropTint: 0xb85c20 },
  { id: 'root_daikon_star', name: 'Daikon Star', rarity: 'Rare', seedCost: 51, baseValue: 115, growthSeconds: 71, cropRow: 8, color: 0xf0f8ff, cropTint: 0xd4e6f1 },
  { id: 'root_taro_essence', name: 'Taro Essence', rarity: 'Rare', seedCost: 58, baseValue: 138, growthSeconds: 76, cropRow: 9, color: 0x6b3e8f, cropTint: 0x8a5ab0 },
  { id: 'leaf_kale', name: 'Kale', rarity: 'Common', seedCost: 7, baseValue: 15, growthSeconds: 28, cropRow: 1, color: 0x2d5016, cropTint: 0x3d6b1f, regrow: 14 },
  { id: 'leaf_chard', name: 'Rainbow Chard', rarity: 'Common', seedCost: 8, baseValue: 18, growthSeconds: 26, cropRow: 2, color: 0x1a4d2e, cropTint: 0x2d7a4d, regrow: 13 },
  { id: 'leaf_bok_choy', name: 'Bok Choy', rarity: 'Common', seedCost: 6, baseValue: 12, growthSeconds: 24, cropRow: 3, color: 0x4a7c59, cropTint: 0x5ea573, regrow: 12 },
  { id: 'leaf_arugula', name: 'Peppery Arugula', rarity: 'Uncommon', seedCost: 22, baseValue: 52, growthSeconds: 48, cropRow: 4, color: 0x1f5c3d, cropTint: 0x2d8659, regrow: 24 },
  { id: 'leaf_collard', name: 'Collard Greens', rarity: 'Uncommon', seedCost: 18, baseValue: 44, growthSeconds: 42, cropRow: 5, color: 0x355c2e, cropTint: 0x4a7a3d, regrow: 21 },
  { id: 'leaf_watercress', name: 'Watercress', rarity: 'Uncommon', seedCost: 25, baseValue: 58, growthSeconds: 50, cropRow: 6, color: 0x0d4d2d, cropTint: 0x1a7a4d, regrow: 25 },
  { id: 'leaf_romaine', name: 'Crisp Romaine', rarity: 'Common', seedCost: 9, baseValue: 20, growthSeconds: 30, cropRow: 7, color: 0x2d5c1a, cropTint: 0x3d8a2d, regrow: 15 },
  { id: 'herb_basil', name: 'Golden Basil', rarity: 'Common', seedCost: 8, baseValue: 15, growthSeconds: 28, cropRow: 1, color: 0xd4af37, cropTint: 0x6b8a1f, regrow: 14 },
  { id: 'herb_thyme', name: 'Twilight Thyme', rarity: 'Common', seedCost: 6, baseValue: 12, growthSeconds: 25, cropRow: 2, color: 0xa78bfa, cropTint: 0x8a7ab0, regrow: 12 },
  { id: 'herb_rosemary', name: 'Starlight Rosemary', rarity: 'Uncommon', seedCost: 22, baseValue: 52, growthSeconds: 47, cropRow: 3, color: 0x60a5fa, cropTint: 0x3d8a7a, regrow: 23 },
  { id: 'herb_sage', name: 'Mystic Sage', rarity: 'Uncommon', seedCost: 25, baseValue: 58, growthSeconds: 51, cropRow: 4, color: 0x7c3aed, cropTint: 0x6c9a6c, regrow: 25 },
  { id: 'herb_cilantro', name: 'Verdant Cilantro', rarity: 'Rare', seedCost: 55, baseValue: 120, growthSeconds: 72, cropRow: 5, color: 0x10b981, cropTint: 0x2d8659, regrow: 36 },
  { id: 'herb_saffron', name: 'Crimson Saffron', rarity: 'Rare', seedCost: 48, baseValue: 105, growthSeconds: 68, cropRow: 6, color: 0xdc2626, cropTint: 0xc4683c, regrow: 34 },
  { id: 'herb_lavender', name: 'Ethereal Lavender', rarity: 'Rare', seedCost: 62, baseValue: 138, growthSeconds: 76, cropRow: 7, color: 0xe879f9, cropTint: 0xb06ad0, regrow: 38 },
  { id: 'grain_golden_wheat', name: 'Golden Wheat', rarity: 'Common', seedCost: 7, baseValue: 15, growthSeconds: 28, cropRow: 1, color: 0xffd700, cropTint: 0xd4af37 },
  { id: 'grain_emerald_barley', name: 'Emerald Barley', rarity: 'Common', seedCost: 9, baseValue: 18, growthSeconds: 31, cropRow: 2, color: 0x90ee90, cropTint: 0x50c878 },
  { id: 'grain_jade_rice', name: 'Jade Rice', rarity: 'Uncommon', seedCost: 22, baseValue: 52, growthSeconds: 47, cropRow: 3, color: 0x98ff98, cropTint: 0x4caa71 },
  { id: 'grain_amber_soybean', name: 'Amber Soybean', rarity: 'Uncommon', seedCost: 25, baseValue: 58, growthSeconds: 43, cropRow: 4, color: 0xffc700, cropTint: 0xffbf00 },
  { id: 'grain_sapphire_lentil', name: 'Sapphire Lentil', rarity: 'Uncommon', seedCost: 20, baseValue: 45, growthSeconds: 50, cropRow: 5, color: 0x4169e1, cropTint: 0x4a7adb },
  { id: 'grain_crimson_chickpea', name: 'Crimson Chickpea', rarity: 'Rare', seedCost: 55, baseValue: 118, growthSeconds: 71, cropRow: 6, color: 0xff6347, cropTint: 0xdc143c },
  { id: 'grain_starlight_quinoa', name: 'Starlight Quinoa', rarity: 'Rare', seedCost: 48, baseValue: 105, growthSeconds: 68, cropRow: 7, color: 0xfffaf0, cropTint: 0xeae0d6 },
  // --- Drop 9: Orchard & Stone Fruits ---
  { id: 'orch_honeycrisp', name: 'Honeycrisp Apple', rarity: 'Common', seedCost: 8, baseValue: 15, growthSeconds: 28, cropRow: 3, color: 0xff6b35, cropTint: 0xff5a3a, regrow: 14 },
  { id: 'orch_golden_pear', name: 'Golden Pear', rarity: 'Common', seedCost: 9, baseValue: 18, growthSeconds: 30, cropRow: 4, color: 0xf4d03f, cropTint: 0xffe135 },
  { id: 'orch_damson_plum', name: 'Damson Plum', rarity: 'Uncommon', seedCost: 22, baseValue: 52, growthSeconds: 47, cropRow: 5, color: 0x4b0082, cropTint: 0x663399, regrow: 24 },
  { id: 'orch_adriatic_fig', name: 'Adriatic Fig', rarity: 'Uncommon', seedCost: 18, baseValue: 48, growthSeconds: 43, cropRow: 6, color: 0x8b4513, cropTint: 0xa0522d },
  { id: 'orch_royal_apricot', name: 'Royal Apricot', rarity: 'Rare', seedCost: 55, baseValue: 118, growthSeconds: 71, cropRow: 7, color: 0xff8c00, cropTint: 0xffb347, regrow: 36 },
  { id: 'orch_mulberry_midnight', name: 'Midnight Mulberry', rarity: 'Rare', seedCost: 48, baseValue: 105, growthSeconds: 68, cropRow: 8, color: 0x2c1b47, cropTint: 0x5d3a7a },
  { id: 'orch_quince_celestial', name: 'Celestial Quince', rarity: 'Legendary', seedCost: 130, baseValue: 340, growthSeconds: 114, cropRow: 9, color: 0xffd700, cropTint: 0xfff1a8, regrow: 57 },
  { id: 'stf_golden_peach', name: 'Golden Peach', rarity: 'Uncommon', seedCost: 22, baseValue: 52, growthSeconds: 46, cropRow: 3, color: 0xffd700, cropTint: 0xffb347, regrow: 23 },
  { id: 'stf_crimson_nectarine', name: 'Crimson Nectarine', rarity: 'Uncommon', seedCost: 18, baseValue: 44, growthSeconds: 42, cropRow: 4, color: 0xff6b6b, cropTint: 0xdc143c, regrow: 21 },
  { id: 'stf_ruby_cherry', name: 'Ruby Cherry', rarity: 'Rare', seedCost: 48, baseValue: 118, growthSeconds: 68, cropRow: 2, color: 0xff1744, cropTint: 0xc41e3a, regrow: 34 },
  { id: 'stf_twilight_plum', name: 'Twilight Plum', rarity: 'Rare', seedCost: 56, baseValue: 135, growthSeconds: 76, cropRow: 5, color: 0x663399, cropTint: 0x7a4bb0, regrow: 38 },
  { id: 'stf_jade_olive', name: 'Jade Olive', rarity: 'Legendary', seedCost: 128, baseValue: 340, growthSeconds: 114, cropRow: 6, color: 0x6b8e23, cropTint: 0x556b2f, regrow: 57 },
  { id: 'stf_sunset_lychee', name: 'Sunset Lychee', rarity: 'Legendary', seedCost: 142, baseValue: 395, growthSeconds: 120, cropRow: 3, color: 0xff4500, cropTint: 0xff6347, regrow: 60 },
  { id: 'stf_celestial_date', name: 'Date Palm', rarity: 'Mythical', seedCost: 310, baseValue: 920, growthSeconds: 165, cropRow: 7, color: 0x8a5a2e, cropTint: 0xb5793e, regrow: 82 },
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
  { id: 'celestial', name: 'Celestial', mult: 50, weight: 0.2, tint: 0x9fe8ff, css: '#9fe8ff' },
];

export const MUTATION_BY_ID: Record<string, Mutation> = Object.fromEntries(
  MUTATIONS.map((m) => [m.id, m]),
);

const MUT_TOTAL = MUTATIONS.reduce((s, m) => s + m.weight, 0);

// Top-tier mutations the Fortune "Jackpot" fork specifically biases toward.
const TOP_MUTATIONS = new Set(['gold', 'rainbow', 'celestial']);

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
