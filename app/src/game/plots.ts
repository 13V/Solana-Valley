// Farm Lands world: a terraced valley. TWO raised plateau BANDS of fenced
// homesteads — 10 across the top, 10 across the bottom — face each other across
// a wide sunken central PLAZA (the valley floor) full of stone paths, a pond,
// markets and decorations. Every homestead's fence opens toward the plaza.
// You own homestead #0 (top-left, fully playable); the other 19 are decorative
// neighbours so the valley reads as a living town.

export type Rect = { x0: number; y0: number; x1: number; y1: number }; // tile coords, inclusive
export type OpenSide = 'N' | 'S';

// ---- homestead geometry (tiles) -----------------------------------------
// Interior of one homestead (inside the fence). Sub-areas are placed relative
// to this interior's top-left corner. Big enough for a 7×10 crop bed plus two pens.
export const HS_IW = 19; // interior width
export const HS_IH = 16; // interior height
// Footprint incl. the 1-tile fence ring on every side.
export const HS_W = HS_IW + 2; // 21
export const HS_H = HS_IH + 2; // 18

// Grid arrangement: 10 columns × 2 bands.
export const COLS = 10;
export const ROWS = 2;
export const MARGIN_X = 4; // tiles of grass left/right of the neighbourhood
export const MARGIN_TOP = 3; // grass above the top band
export const MARGIN_BOTTOM = 3; // grass below the bottom band
export const GAP_X = 2; // grass/path gap between homestead columns
export const GAP_Y = 16; // the central PLAZA between the two bands (valley floor)

// The land is an island: a ring of ocean (+ a sand beach just inside it) wraps
// the whole grid. Homesteads sit on the grass well within the beach.
export const SHORE = 3; // ocean tiles at the very edge
export const BEACH = 2; // sand beach tiles just inside the ocean
export const ISLAND_BORDER = SHORE + BEACH; // grass starts this many tiles in

// Sub-area layout *relative to a homestead interior's top-left (ix, iy)*.
// "Cozy Homestead": cottage centrepiece across the back, a big crop bed down the
// left, chicken house + cow pen on the right, an orchard row along the front.
export const SUB = {
  house: { cx: 9, baseRow: 3 }, // cottage centre col + base row (top-centre)
  farm: { x: 1, y: 5, w: 7, h: 10 }, // 7×10 = 70-tile crop bed (left, full height)
  chickenPen: { x: 11, y: 1, w: 7, h: 6 }, // chicken house + run (right-top)
  cowPen: { x: 11, y: 8, w: 7, h: 7 }, // cow pasture (right-bottom)
  orchard: { x: 1, y: 1, w: 7, h: 2 }, // fruit-tree slots tucked top-left (bought trees)
  signCx: 9, // name sign column
};

// ---- purchasable crop-bed expansion -------------------------------------
// The base bed is SUB.farm (cols x:1–7). The interior band x:8–10 between the
// bed and the pens (chickenPen/cowPen both start at x:11) is genuinely-free
// grass — no obstacles, pens, orchard or fence sit there. A purchased
// expansion grows the FARMABLE area one column at a time into that band, across
// the bed's own row range. Capped at 3 columns (x:8,9,10) so it never reaches
// the pens at x:11. (orchard/house/sign all live elsewhere, so these columns
// are safe for tilling.)
export const MAX_PLOT_EXPANSION = 3;

// Coin cost of the NEXT expansion column given how many are already bought.
// A gentle geometric curve (base × 1.7^level) so each extra column is a
// meaningful, escalating coin sink without being absurd: 500 → 850 → 1445.
export const PLOT_EXPANSION_BASE_COST = 500;
export function plotExpansionCost(level: number): number {
  return Math.round(PLOT_EXPANSION_BASE_COST * Math.pow(1.7, level));
}

export type Homestead = {
  index: number;
  col: number; row: number; // grid position
  openSide: OpenSide; // which fence side faces the central plaza
  ix: number; iy: number; // interior top-left (tile)
  interior: Rect; // full interior rect (inside the fence)
  house: { cx: number; baseRow: number };
  farm: Rect; // 7×10 crop bed (inclusive tile rect)
  chickenPen: Rect; // chicken pen (inclusive tile rect)
  cowPen: Rect; // cow pasture (inclusive tile rect)
  orchard: Rect; // tree slots (inclusive tile rect)
  signCx: number; // sign column (tile)
  owner: string; // display name ('You' for the player)
  mine: boolean;
};

const NAMES = [
  'You', 'Maya', 'Leo', 'Aria', 'Finn', 'Noor', 'Kai', 'Luna', 'Milo', 'Sage',
  'Iris', 'Otto', 'Wren', 'Hugo', 'Beau', 'Cleo', 'Remy', 'Nova', 'Theo', 'Juno',
];

function makeHomestead(index: number): Homestead {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  // Interior top-left: skip the margin + the left fence (+1), then stride by
  // footprint + gap for each preceding column/row.
  const ix = ISLAND_BORDER + MARGIN_X + 1 + col * (HS_W + GAP_X);
  const iy = ISLAND_BORDER + MARGIN_TOP + 1 + row * (HS_H + GAP_Y);
  const r = (x: number, y: number, w: number, h: number): Rect => ({
    x0: ix + x, y0: iy + y, x1: ix + x + w - 1, y1: iy + y + h - 1,
  });
  return {
    index,
    col, row,
    openSide: row === 0 ? 'S' : 'N', // top band opens down, bottom band opens up
    ix, iy,
    interior: { x0: ix, y0: iy, x1: ix + HS_IW - 1, y1: iy + HS_IH - 1 },
    house: { cx: ix + SUB.house.cx, baseRow: iy + SUB.house.baseRow },
    farm: r(SUB.farm.x, SUB.farm.y, SUB.farm.w, SUB.farm.h),
    chickenPen: r(SUB.chickenPen.x, SUB.chickenPen.y, SUB.chickenPen.w, SUB.chickenPen.h),
    cowPen: r(SUB.cowPen.x, SUB.cowPen.y, SUB.cowPen.w, SUB.cowPen.h),
    orchard: r(SUB.orchard.x, SUB.orchard.y, SUB.orchard.w, SUB.orchard.h),
    signCx: ix + SUB.signCx,
    owner: NAMES[index % NAMES.length],
    mine: index === 0,
  };
}

export const HOMESTEADS: Homestead[] = Array.from({ length: COLS * ROWS }, (_, i) => makeHomestead(i));

// The player owns homestead #0 (top-left).
export const PLAYER = HOMESTEADS[0];
export const NEIGHBOR_HOMESTEADS = HOMESTEADS.filter((h) => !h.mine);

// Footprint-inclusive rectangle (incl. fence ring) covering every plot in a
// band row — used to render each band as one raised plateau (terrace).
export function bandRect(row: number): Rect {
  const firstIx = ISLAND_BORDER + MARGIN_X + 1;
  const lastIx = ISLAND_BORDER + MARGIN_X + 1 + (COLS - 1) * (HS_W + GAP_X);
  const iy = ISLAND_BORDER + MARGIN_TOP + 1 + row * (HS_H + GAP_Y);
  return { x0: firstIx - 1, y0: iy - 1, x1: lastIx + HS_IW, y1: iy + HS_IH };
}

// The sunken central plaza (valley floor) between the two bands, inclusive.
export const PLAZA: Rect = {
  x0: bandRect(0).x0,
  y0: bandRect(0).y1 + 1,
  x1: bandRect(0).x1,
  y1: bandRect(1).y0 - 1,
};

// ---- the player's homestead (drives farming + producers) -----------------
export const HOME = {
  houseCx: PLAYER.house.cx,
  houseBaseRow: PLAYER.house.baseRow,
  plot: {
    px: PLAYER.farm.x0,
    py: PLAYER.farm.y0,
    pw: PLAYER.farm.x1 - PLAYER.farm.x0 + 1,
    ph: PLAYER.farm.y1 - PLAYER.farm.y0 + 1,
  },
  chickenPen: { ...PLAYER.chickenPen } as Rect, // chickens roam here
  cowPen: { ...PLAYER.cowPen } as Rect, // cows roam here
  orchard: { ...PLAYER.orchard } as Rect, // fruit trees
};

export const MY_PLOT = HOME.plot;

export function isInMyPlot(tx: number, ty: number): boolean {
  return tx >= MY_PLOT.px && tx < MY_PLOT.px + MY_PLOT.pw && ty >= MY_PLOT.py && ty < MY_PLOT.py + MY_PLOT.ph;
}

// ---- multiplayer helpers (dynamic owned plot) ----------------------------
// A homestead's crop bed expressed the same way HOME.plot is (origin + size in
// tiles) so the same "is this my farm" maths works for ANY assigned plot index.
export type PlotRect = { px: number; py: number; pw: number; ph: number };

// Clamp an out-of-range index to a valid homestead so a bad assignment never
// throws (defaults to the player's home plot #0).
function safeIndex(index: number): number {
  return Number.isInteger(index) && index >= 0 && index < HOMESTEADS.length ? index : 0;
}

// The crop-bed rect (origin + size, tiles) for a given homestead index.
export function homesteadPlot(index: number): PlotRect {
  const f = HOMESTEADS[safeIndex(index)].farm;
  return { px: f.x0, py: f.y0, pw: f.x1 - f.x0 + 1, ph: f.y1 - f.y0 + 1 };
}

// True if (tx,ty) sits inside the given crop-bed rect.
export function isInPlot(rect: PlotRect, tx: number, ty: number): boolean {
  return tx >= rect.px && tx < rect.px + rect.pw && ty >= rect.py && ty < rect.py + rect.ph;
}

// The walkable gate tile (the fence gap that opens onto the plaza) for a
// homestead. Mirrors buildHomestead's gate maths: gate column is the interior
// centre; the gate row is one tile outside the plaza-facing fence.
export function homesteadGateTile(index: number): { tx: number; ty: number } {
  const h = HOMESTEADS[safeIndex(index)];
  const it = h.interior;
  const gateCx = Math.floor((it.x0 + it.x1) / 2);
  const gateY = h.openSide === 'S' ? it.y1 + 1 : it.y0 - 1;
  return { tx: gateCx, ty: gateY };
}

// The centre tile of the sunken central plaza (the multiplayer spawn point).
export function plazaCenterTile(): { tx: number; ty: number } {
  return {
    tx: Math.floor((PLAZA.x0 + PLAZA.x1) / 2),
    ty: Math.floor((PLAZA.y0 + PLAZA.y1) / 2),
  };
}

// ---- neighbours (kept for back-compat with code that scans plot interiors) -
export type Neighbor = {
  px: number; py: number; pw: number; ph: number; // crop-bed interior
  owner: string;
};

export const NEIGHBORS: Neighbor[] = NEIGHBOR_HOMESTEADS.map((h) => ({
  px: h.farm.x0, py: h.farm.y0,
  pw: h.farm.x1 - h.farm.x0 + 1,
  ph: h.farm.y1 - h.farm.y0 + 1,
  owner: h.owner,
}));

// World size needed to hold the whole grid: the homestead grid + grass margins +
// the island's ocean/beach ring on every side. (constants.ts re-exports these as
// GRID_W / GRID_H so the two never drift.)
export const WORLD_COLS = 2 * ISLAND_BORDER + 2 * MARGIN_X + COLS * HS_W + (COLS - 1) * GAP_X;
export const WORLD_ROWS = 2 * ISLAND_BORDER + MARGIN_TOP + ROWS * HS_H + (ROWS - 1) * GAP_Y + MARGIN_BOTTOM;
