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
import socialHub from './socialHub.json';

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

// The player's private home island (single-player farming).
export const map = startIsland as unknown as SproutMap;
// The shared social hub island (reached by the boat; multiplayer).
export const hubMap = socialHub as unknown as SproutMap;

// Every distinct tileset key a map references (for BootScene preloading).
export function tilesetKeysFor(m: SproutMap): string[] {
  const keys = new Set<string>();
  for (const layer of m.layers) {
    for (const k in layer.cells) keys.add(layer.cells[k][0]);
  }
  return [...keys].sort();
}

// The island's keys (kept for compatibility) and the union across both maps so
// BootScene loads every tileset either map needs.
export const usedTilesetKeys: string[] = tilesetKeysFor(map);
export const allTilesetKeys: string[] = [...new Set([...tilesetKeysFor(map), ...tilesetKeysFor(hubMap)])].sort();

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
