// Grow-a-Garden-style plots. The server has 20 plots laid out in a grid below
// the home/town area; each is allocated to one player. In single-player you farm
// your one allocated plot and the other 19 are neighbours (shown growing crops
// so the server feels alive). Plots can't be bought — one per player.

export type Plot = {
  id: number;
  px: number; // interior top-left tile x
  py: number; // interior top-left tile y
  pw: number; // interior width in tiles
  ph: number; // interior height in tiles
  owner: string; // display name on the plot sign
  mine: boolean; // the player's allocated plot
};

const PW = 5; // interior plant columns per plot
const PH = 4; // interior plant rows per plot
const COLS = [2, 9, 16, 23]; // interior x of each plot column
const ROWS = [21, 27, 33, 39, 45]; // interior y of each plot row
const MINE_COL = 1; // player's plot column index
const MINE_ROW = 0; // player's plot row index

// Flavour names so the grid reads like a 20-player server.
const NAMES = [
  'Maya', 'Leo', 'Aria', 'Finn', 'Noor', 'Kai', 'Luna', 'Milo', 'Sage', 'Rumi',
  'Beau', 'Iris', 'Otto', 'Wren', 'Cleo', 'Hugo', 'Vera', 'Remy', 'Juno',
];

export const PLOTS: Plot[] = [];
{
  let id = 0;
  let nameIdx = 0;
  for (let r = 0; r < ROWS.length; r++) {
    for (let c = 0; c < COLS.length; c++) {
      const mine = c === MINE_COL && r === MINE_ROW;
      PLOTS.push({
        id: id++,
        px: COLS[c],
        py: ROWS[r],
        pw: PW,
        ph: PH,
        owner: mine ? 'You' : NAMES[nameIdx++],
        mine,
      });
    }
  }
}

export const MY_PLOT: Plot = PLOTS.find((p) => p.mine)!;

export function isInPlot(plot: Plot, tx: number, ty: number): boolean {
  return tx >= plot.px && tx < plot.px + plot.pw && ty >= plot.py && ty < plot.py + plot.ph;
}

export function isInMyPlot(tx: number, ty: number): boolean {
  return isInPlot(MY_PLOT, tx, ty);
}
