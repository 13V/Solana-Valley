// Solana Valley world: a tidy neighbourhood of 10 fenced "homesteads" laid out
// in a 5×2 grid. Each homestead is a self-contained mini-farm with three areas:
// a HOUSE (cottage), a CROP FARM (tillable bed) and an ANIMAL PEN (coop + pen).
// You own homestead #0 (fully playable); the other 9 are decorative neighbours
// so the server reads as alive. Everything is flat.

export type Rect = { x0: number; y0: number; x1: number; y1: number }; // tile coords, inclusive

// ---- homestead geometry (tiles) -----------------------------------------
// Interior of one homestead (inside the fence). Sub-areas are placed relative
// to this interior's top-left corner.
export const HS_IW = 14; // interior width
export const HS_IH = 11; // interior height
// Footprint incl. the 1-tile fence ring on every side.
export const HS_W = HS_IW + 2; // 16
export const HS_H = HS_IH + 2; // 13

// Grid arrangement.
export const COLS = 5;
export const ROWS = 2;
export const MARGIN_X = 3; // tiles of grass left of the first column
export const MARGIN_TOP = 3; // tiles above the first row
export const GAP_X = 2; // grass/path gap between homestead columns
export const GAP_Y = 3; // gap between the two rows (leaves room for the avenue)

// Sub-area layout *relative to a homestead interior's top-left (ix, iy)*.
// HOUSE: cottage near the top-left. CROP FARM: 5×4 bed lower-left.
// ANIMAL PEN: 6×7 pen on the right. ORCHARD: 1-2 tree slots above the pen.
export const SUB = {
  house: { cx: 2, baseRow: 3 }, // cottage centre col + base row (offsets in interior)
  farm: { x: 0, y: 6, w: 5, h: 4 }, // tillable bed
  pen: { x: 7, y: 3, w: 6, h: 7 }, // animal pen (fenced)
  orchard: { x: 8, y: 0, w: 4, h: 2 }, // 1-2 fruit trees, top-right above the pen
  signCx: 6, // name sign column (top edge), in interior coords
};

export type Homestead = {
  index: number;
  ix: number; iy: number; // interior top-left (tile)
  interior: Rect; // full interior rect (inside the fence)
  house: { cx: number; baseRow: number };
  farm: Rect; // crop bed (inclusive tile rect)
  pen: Rect; // animal pen (inclusive tile rect)
  orchard: Rect; // tree slots (inclusive tile rect)
  signCx: number; // sign column (tile)
  owner: string; // display name ('You' for the player)
  mine: boolean;
};

const NAMES = [
  'You', 'Maya', 'Leo', 'Aria', 'Finn', 'Noor', 'Kai', 'Luna', 'Milo', 'Sage',
];

function makeHomestead(index: number): Homestead {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  // Interior top-left: skip the margin + the left fence (+1), then stride by
  // footprint + gap for each preceding column/row.
  const ix = MARGIN_X + 1 + col * (HS_W + GAP_X);
  const iy = MARGIN_TOP + 1 + row * (HS_H + GAP_Y);
  const r = (x: number, y: number, w: number, h: number): Rect => ({
    x0: ix + x, y0: iy + y, x1: ix + x + w - 1, y1: iy + y + h - 1,
  });
  return {
    index,
    ix, iy,
    interior: { x0: ix, y0: iy, x1: ix + HS_IW - 1, y1: iy + HS_IH - 1 },
    house: { cx: ix + SUB.house.cx, baseRow: iy + SUB.house.baseRow },
    farm: r(SUB.farm.x, SUB.farm.y, SUB.farm.w, SUB.farm.h),
    pen: r(SUB.pen.x, SUB.pen.y, SUB.pen.w, SUB.pen.h),
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

// ---- the player's homestead (drives farming + producers) -----------------
// MY_PLOT = the player's crop bed (where hoe/plant/water/harvest work).
// HOME.pen = where animals spawn/wander. HOME.orchard = where fruit trees go.
export const HOME = {
  houseCx: PLAYER.house.cx,
  houseBaseRow: PLAYER.house.baseRow,
  plot: {
    px: PLAYER.farm.x0,
    py: PLAYER.farm.y0,
    pw: PLAYER.farm.x1 - PLAYER.farm.x0 + 1,
    ph: PLAYER.farm.y1 - PLAYER.farm.y0 + 1,
  },
  pen: { ...PLAYER.pen } as Rect, // animal roaming area
  orchard: { ...PLAYER.orchard } as Rect, // fruit trees
};

export const MY_PLOT = HOME.plot;

export function isInMyPlot(tx: number, ty: number): boolean {
  return tx >= MY_PLOT.px && tx < MY_PLOT.px + MY_PLOT.pw && ty >= MY_PLOT.py && ty < MY_PLOT.py + MY_PLOT.ph;
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

// World size needed to hold the whole grid, with a margin on every side.
export const WORLD_COLS = MARGIN_X * 2 + COLS * HS_W + (COLS - 1) * GAP_X;
export const WORLD_ROWS = MARGIN_TOP + ROWS * HS_H + (ROWS - 1) * GAP_Y + 4;
