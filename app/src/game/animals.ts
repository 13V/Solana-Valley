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
  icon: string; // UI icon path
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
    sheet: 'chicken', idleFrames: [0, 1], walkFrames: [4, 5, 6, 7], scale: 2, originY: 0.5, stationary: false,
    productSheet: 'eggitem', productFrame: 0, productOffsetY: -18, icon: '/assets/sprout-ui/icon_chicken.png',
  },
  {
    id: 'cow', name: 'Cow', category: 'animal', cost: 600, unlockLevel: 6,
    productName: 'Milk', productValue: 85, layMs: 60_000, xp: 16,
    sheet: 'cow', idleFrames: [0, 1], walkFrames: [3, 4], scale: 1.5, originY: 0.5, stationary: false,
    productSheet: 'milkitem', productFrame: 0, productOffsetY: -30, icon: '/assets/sprout-ui/icon_cow.png',
  },
  tree('apple', 'Apple Tree', 500, 4, 120, 45_000, 14),
  tree('orange', 'Orange Tree', 900, 8, 230, 55_000, 22),
  tree('peach', 'Peach Tree', 1500, 12, 420, 70_000, 34),
  tree('pear', 'Pear Tree', 2400, 16, 680, 85_000, 50),
];

export const ANIMAL_BY_ID: Record<string, AnimalDef> = Object.fromEntries(
  ANIMALS.map((a) => [a.id, a]),
);
