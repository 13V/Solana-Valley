// Animals: a passive-income progression layer. Buy animals (unlocked by level);
// they wander a pen and produce a product on a timer that you click to collect
// for coins + XP.

export type AnimalDef = {
  id: string;
  name: string;
  cost: number;
  unlockLevel: number;
  productName: string;
  productValue: number;
  layMs: number; // time to produce one product
  xp: number; // XP per collection
};

export const ANIMALS: AnimalDef[] = [
  { id: 'chicken', name: 'Chicken', cost: 150, unlockLevel: 3, productName: 'Egg', productValue: 28, layMs: 30_000, xp: 6 },
];

export const ANIMAL_BY_ID: Record<string, AnimalDef> = Object.fromEntries(
  ANIMALS.map((a) => [a.id, a]),
);
