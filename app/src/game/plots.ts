// Grow-a-Garden-style world. Your homestead is a strip — house → your plot →
// animal pen → orchard, left to right — at the top of a larger world the camera
// scrolls around. Below it is a grid of 20 neighbour plots (one allocated per
// player; you can't buy more), shown growing crops so the server feels alive.

export type Rect = { x0: number; y0: number; x1: number; y1: number }; // tile coords, inclusive

// ---- the player's homestead (tile coords) -------------------------------
export const HOME = {
  houseCx: 5, // cabin centre column
  houseBaseRow: 7, // cabin base row
  plot: { px: 9, py: 3, pw: 6, ph: 5 }, // your farmable plot (interior)
  pen: { x0: 17, y0: 3, x1: 23, y1: 8 } as Rect, // animal roaming area
  orchard: { x0: 25, y0: 3, x1: 31, y1: 8 } as Rect, // fruit trees
  well: { x: 3, y: 10 },
  pond: { x0: 1, y0: 13, w: 3, h: 2 },
};

export const MY_PLOT = HOME.plot;

export function isInMyPlot(tx: number, ty: number): boolean {
  return tx >= MY_PLOT.px && tx < MY_PLOT.px + MY_PLOT.pw && ty >= MY_PLOT.py && ty < MY_PLOT.py + MY_PLOT.ph;
}

// ---- neighbours ---------------------------------------------------------
export type Neighbor = {
  px: number; py: number; pw: number; ph: number; // plot interior
  owner: string;
};

const NEI_COLS = [2, 10, 18, 26, 34]; // interior x of each neighbour column
const NEI_ROWS = [14, 22, 30, 38]; // interior y of each neighbour row
const NEI_W = 5;
const NEI_H = 5;
const NAMES = [
  'Maya', 'Leo', 'Aria', 'Finn', 'Noor', 'Kai', 'Luna', 'Milo', 'Sage', 'Rumi',
  'Beau', 'Iris', 'Otto', 'Wren', 'Cleo', 'Hugo', 'Vera', 'Remy', 'Juno', 'Zola',
];

export const NEIGHBORS: Neighbor[] = [];
{
  let n = 0;
  for (const py of NEI_ROWS) {
    for (const px of NEI_COLS) {
      NEIGHBORS.push({ px, py, pw: NEI_W, ph: NEI_H, owner: NAMES[n % NAMES.length] });
      n++;
    }
  }
}

// World size needed to hold everything (tiles), with a margin.
export const WORLD_COLS = 41;
export const WORLD_ROWS = 45;
