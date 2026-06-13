// A seed offer in the shop's current stock.
export type ShopEntry = { plantId: string; stock: number };

// State the Phaser game pushes up to the React UI on change.
export type UiState = {
  coins: number;
  selected: string; // 'hoe' | 'can' | 'seed'
  selectedSeed: string | null; // plant id used when planting
  seeds: Record<string, number>; // plantId -> count owned
  harvest: Record<string, number>; // stackKey -> count owned
  shop: ShopEntry[]; // full catalog with current stock
};

// Lightweight time/restock state, emitted about once per second.
export type ClockState = {
  day: number;
  clock: string; // "06:30"
  phase: 'dawn' | 'day' | 'dusk' | 'night';
  restockIn: number; // seconds until shop restock
};
