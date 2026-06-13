// State the Phaser game pushes up to the React UI layer.
export type UiState = {
  coins: number;
  day: number;
  selected: string; // active hotbar slot id
  inventory: Record<string, number>;
};
