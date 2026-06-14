// Animals: a passive-income progression layer. Buy animals (unlocked by level);
// they wander a pen and produce a product on a timer that you click to collect
// for coins + XP. Each def carries its sprite-sheet layout so the scene renders
// any animal generically.

export type AnimalDef = {
  id: string;
  name: string;
  cost: number;
  unlockLevel: number;
  productName: string;
  productValue: number;
  layMs: number; // time to produce one product
  xp: number; // XP per collection
  // rendering
  sheet: string; // loaded spritesheet key
  idleFrames: number[];
  walkFrames: number[];
  scale: number;
  productSheet: string; // product indicator spritesheet key
  productFrame: number;
  productOffsetY: number; // px above the animal to show the product
};

export const ANIMALS: AnimalDef[] = [
  {
    id: 'chicken', name: 'Chicken', cost: 150, unlockLevel: 3,
    productName: 'Egg', productValue: 28, layMs: 30_000, xp: 6,
    sheet: 'chicken', idleFrames: [0, 1], walkFrames: [4, 5, 6, 7], scale: 2,
    productSheet: 'eggitem', productFrame: 0, productOffsetY: -18,
  },
  {
    id: 'cow', name: 'Cow', cost: 600, unlockLevel: 6,
    productName: 'Milk', productValue: 85, layMs: 60_000, xp: 16,
    sheet: 'cow', idleFrames: [0, 1], walkFrames: [3, 4], scale: 1.5,
    productSheet: 'milkitem', productFrame: 0, productOffsetY: -30,
  },
];

export const ANIMAL_BY_ID: Record<string, AnimalDef> = Object.fromEntries(
  ANIMALS.map((a) => [a.id, a]),
);
