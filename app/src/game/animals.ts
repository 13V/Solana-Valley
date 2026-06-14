// Producers: a passive-income progression layer covering farm animals and fruit
// trees. Buy one (unlocked by level); it produces a product on a timer that you
// click to collect for coins + XP. Animals wander a pen; trees stand in the
// orchard. Each def carries its sprite layout so the scene renders any producer
// generically.

export type AnimalDef = {
  id: string;
  name: string;
  category: 'animal' | 'tree';
  cost: number;
  unlockLevel: number;
  productName: string;
  productValue: number;
  layMs: number;
  xp: number;
  // rendering
  sheet: string;
  idleFrames: number[];
  walkFrames: number[];
  scale: number;
  originY: number; // sprite origin Y (trees anchor near their base)
  stationary: boolean; // trees don't wander
  productSheet: string;
  productFrame: number;
  productOffsetY: number; // px from the sprite to show the product
  productScale?: number; // product sprite scale (defaults to 2)
  icon: string; // UI icon path
  colorways?: string[]; // optional palette-swap sheets; one is picked per animal
  rareColor?: string; // the uncommon colour in colorways (rolled less often)
};

const tree = (
  id: string,
  name: string,
  cost: number,
  unlockLevel: number,
  productValue: number,
  layMs: number,
  xp: number,
): AnimalDef => ({
  id, name, category: 'tree', cost, unlockLevel,
  productName: name.replace(' Tree', ''), productValue, layMs, xp,
  sheet: `tree_${id}`, idleFrames: [0], walkFrames: [0], scale: 2, originY: 0.92, stationary: true,
  productSheet: `fruit_${id}`, productFrame: 0, productOffsetY: -52,
  icon: `/assets/sprout-ui/icon_fruit_${id}.png`,
});

export const ANIMALS: AnimalDef[] = [
  {
    id: 'chicken', name: 'Chicken', category: 'animal', cost: 150, unlockLevel: 3,
    productName: 'Egg', productValue: 28, layMs: 30_000, xp: 6,
    sheet: 'chick_white', idleFrames: [0, 1, 2, 3], walkFrames: [16, 17, 18, 19, 20, 21, 22, 23],
    scale: 2.4, originY: 0.72, stationary: false,
    productSheet: 'eggitem', productFrame: 0, productOffsetY: -20, productScale: 1.4,
    icon: '/assets/sprout-ui/icon_chicken.png',
    colorways: ['chick_white', 'chick_brown', 'chick_green', 'chick_red', 'chick_blue'], rareColor: 'chick_blue',
  },
  {
    id: 'cow', name: 'Cow', category: 'animal', cost: 600, unlockLevel: 6,
    productName: 'Milk', productValue: 85, layMs: 60_000, xp: 16,
    sheet: 'cow_light', idleFrames: [0, 1, 2], walkFrames: [8, 9, 10, 11, 12, 13, 14, 15],
    scale: 1.7, originY: 0.78, stationary: false,
    productSheet: 'milkitem', productFrame: 0, productOffsetY: -30, productScale: 1.4,
    icon: '/assets/sprout-ui/icon_cow.png',
    colorways: ['cow_light', 'cow_brown', 'cow_green', 'cow_pink', 'cow_purple'], rareColor: 'cow_purple',
  },
  tree('apple', 'Apple Tree', 500, 4, 120, 45_000, 14),
  tree('orange', 'Orange Tree', 900, 8, 230, 55_000, 22),
  tree('peach', 'Peach Tree', 1500, 12, 420, 70_000, 34),
  tree('pear', 'Pear Tree', 2400, 16, 680, 85_000, 50),
];

export const ANIMAL_BY_ID: Record<string, AnimalDef> = Object.fromEntries(
  ANIMALS.map((a) => [a.id, a]),
);
