// Data-driven map loader for the hand-authored "Sprout Valley" start island.
//
// The map (startIsland.json, format `sprout-valley-map` v1) is a JSON document:
//   { format, version, tile, w, h, bg, active, layers: [{ name, visible, cells }] }
// where `cells` is keyed "x,y" (tile coords) → [tilesetKey, frameIndex].
//
// Each tilesetKey names a 16×16-tile spritesheet loaded by BootScene under the
// same key (the PNG filename without ".png"). A frameIndex is read row-major
// into that sheet: with cols = imageWidth/16, col = frame % cols and
// row = frame // cols. Phaser's spritesheet loader already numbers frames that
// way, so the index can be handed straight to `add.image(x, y, key, frame)`.
import startIsland from './startIsland.json';

export type MapCell = [string, number]; // [tilesetKey, frameIndex]

export type MapLayer = {
  name: string;
  visible: boolean;
  cells: Record<string, MapCell>;
};

export type SproutMap = {
  format: string;
  version: number;
  tile: number;
  w: number;
  h: number;
  bg: boolean;
  active: number;
  layers: MapLayer[];
};

// The parsed map. Consumers read w/h/tile/layers off this. The JSON's inferred
// type widens each cell to (string | number)[]; cast through `unknown` to the
// declared tuple shape (the data is validated by the authoring tool).
export const map = startIsland as unknown as SproutMap;

// Every distinct tileset key referenced by the map (handy for asset preloading
// / sanity checks).
export const usedTilesetKeys: string[] = (() => {
  const keys = new Set<string>();
  for (const layer of map.layers) {
    for (const k in layer.cells) keys.add(layer.cells[k][0]);
  }
  return [...keys].sort();
})();

// A coarse gameplay category for a tileset key. Drives how a cell is rendered
// and which behaviour set it joins (water = fishable + solid, solidObj = solid,
// farm = tillable/plantable, flat = walkable decor over grass, grass = plain
// walkable ground).
export type TileCategory = 'water' | 'farm' | 'solidObj' | 'flat' | 'grass';

export function classify(key: string): TileCategory {
  if (key.includes('ground_tiles_water')) return 'water';
  if (key.includes('tilled_dirt')) return 'farm';
  if (
    key.includes('fences') ||
    key.includes('animal_structures') ||
    key.includes('chikcen_houses') ||
    key.includes('objects_boats') ||
    key.includes('tree_animations')
  ) {
    return 'solidObj';
  }
  if (key.includes('stone_path') || key.includes('wooden_bridge')) return 'flat';
  return 'grass';
}

// Convenience: true for the rowboat tiles (the future hub portal).
export function isBoatKey(key: string): boolean {
  return key.includes('premium_objects_boats');
}
