# Map Integration Guide

**Purpose:** hand a map built in the **Sprout Valley Map Editor** (`map-editor/`)
to a Claude Code session (or any developer) so it can be integrated into the
game. This file is the complete spec — a fresh session should need nothing else.

> TL;DR for an integrating session:
> 1. A saved map is a `sprout-valley-map` JSON file (see schema below). Saved
>    maps live in **`app/public/maps/*.json`**.
> 2. Each cell references a tile by `[sheetId, cellIndex]`, resolved against the
>    tile manifest **`app/public/sprout-tiles/tiles-manifest.json`** (the tile
>    PNGs are in `app/public/sprout-tiles/`).
> 3. **A working reference integration already exists:**
>    `app/src/game/scenes/MapScene.ts` loads, renders, and adds collision for one
>    of these maps and lets the player walk it (Explore mode — press `M` in the
>    farm, or boot `?map=<name>`). The fastest integration is to reuse/extend it.

---

## 1. How to hand off a map

1. In the editor (`map-editor/`, or the deployed Pages site), click **Save** →
   downloads `sprout-map.json`.
2. Put it in the repo at **`app/public/maps/<name>-map.json`** and commit it.
   (The game's Explore mode auto-loads `maps/<name>-map.json` when booted with
   `?map=<name>`; `app/public/maps/sample-map.json` is a worked example.)
3. Start a new Claude Code session on this repo and say, e.g.:

   > "Integrate `app/public/maps/<name>-map.json` into the game. Read
   > `MAP_INTEGRATION.md`; reuse `app/src/game/scenes/MapScene.ts` as the
   > reference. [Make it the farm terrain / add it as a new explorable area /
   > …]."

That's all the next session needs — the map, the manifest, the tiles, and the
reference scene are all in the repo.

---

## 2. Save-file format — `sprout-valley-map`

Produced by `serializeProject()` in `map-editor/editor.js`.

```json
{
  "format": "sprout-valley-map",
  "version": 1,
  "tile": 16,
  "w": 40,
  "h": 30,
  "bg": true,
  "active": 0,
  "layers": [
    {
      "name": "Ground",
      "visible": true,
      "cells": {
        "12,7": ["premium_tilesets_ground_tiles_new_tiles_darker_grass_tile_layers", 13],
        "13,7": ["premium_tilesets_ground_tiles_new_tiles_darker_grass_tile_layers", 14]
      }
    },
    { "name": "Objects", "visible": true, "cells": { "0,0": ["premium_tilesets_building_parts_fences", 4] } }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `tile` | Source tile size in px. Always **16**. |
| `w`, `h` | Map size in **cells** (columns × rows). |
| `layers` | Bottom-to-top. Index 0 is the bottom (drawn first). |
| `layers[].visible` | If `false`, skip the layer. |
| `layers[].cells` | Map of `"x,y"` (grid cell) → `[sheetId, cellIndex]`. **One tile per cell per layer.** Empty cells are simply absent. |
| `bg` | Editor checkerboard flag — cosmetic, ignore for integration. |
| `active` | Editor's active-layer index — cosmetic, ignore. |

---

## 3. Resolving a tile (`[sheetId, cellIndex]` → pixels)

Use the manifest **`app/public/sprout-tiles/tiles-manifest.json`** (identical to
`map-editor/tiles-manifest.json`):

```json
{ "tile": 16, "sheets": [
  { "id": "...", "file": "tiles/premium/.../darker_grass_tile_layers.png",
    "cols": 11, "rows": 7, "group": "Tilesets / ground tiles / New tiles",
    "name": "Darker_Grass_Tile_Layers", "cells": [0,1,2,...] }
] }
```

Given a cell `[sheetId, i]`:

1. `sheet = manifest.sheets.find(s => s.id === sheetId)`.
2. Source PNG: in the **game** it's `app/public/sprout-tiles/` + `sheet.file`
   **with the leading `tiles/` stripped** (e.g.
   `app/public/sprout-tiles/premium/.../darker_grass_tile_layers.png`). In the
   **editor** it's `map-editor/` + `sheet.file` verbatim.
3. Source rect for index `i` (row-major over `sheet.cols`):
   `sx = (i % sheet.cols) * 16`, `sy = (Math.floor(i / sheet.cols)) * 16`, size `16×16`.
   *Example:* `cols 11`, `i 13` → `sx = 32`, `sy = 16`.
4. In Phaser, loading the PNG as a spritesheet with `frameWidth/Height: 16`
   makes the **frame number equal `cellIndex`** directly (row-major), so you can
   skip the math: `this.add.image(px, py, key, cellIndex)`.

**Scale:** the game world is **32 px/tile** (`TILE` in `app/src/game/constants.ts`)
but editor tiles are 16 px — draw each tile at **2×** so **one editor cell = one
game tile** (grid stays 1:1). World pixel of cell `(cx,cy)` center:
`px = cx*32 + 16`, `py = cy*32 + 16`.

`sheet.cells` lists only the **non-empty** cells of a sheet (placeable tiles);
you won't get references to blank cells.

---

## 4. Collision convention

The editor doesn't store explicit collision, so derive it. The convention used
by the reference scene (`MapScene.ts`) — and the one the editor's authoring
workflow assumes — is:

- **A cell is solid if it has a tile on any layer above the bottom (index ≥ 1)**,
  i.e. the bottom layer = floor/terrain (walkable), upper layers = objects
  (fences, water, buildings → solid). This is the recommended way to author
  maps for the game.
- **Plus** a conservative obstacle-keyword fallback so single-layer maps still
  block: solid if the tile's sheet `group`/`name` matches
  `fence|water|tree|bush|stump|rock|boulder|well|house|hut|barn|coop|chicken_house|pond|chest`.
  (Cliffs/hills are deliberately excluded — their plateau tops are walkable.)

If you need precise collision, add a collision/markup layer to the editor export
(see "future work" below) — but the convention above is enough for most maps.

---

## 5. Two integration paths

### Path A — reuse the reference scene (lowest effort)
`app/src/game/scenes/MapScene.ts` already:
- fetches the manifest, lazy-loads only the sheets a map uses,
- renders all layers (16 px → 32 px), builds a merged collision grid,
- spawns the shared `pchar` player with the farm's movement/animation feel,
  follows with the camera, and sets world bounds to the map size.

It's wired into `createGame.ts` (scene list), `BootScene.ts` (`?map=` route),
and `FarmScene.ts` (`M` key). Extend it for behind-object occlusion (y-sort),
interactions, NPCs, etc. **Best when the goal is "walk/play the built map."**

### Path B — bake the map into the farm terrain (`FarmScene.ts`)
Higher effort and more coupling. The seam is **`FarmScene.buildWorld()`** (~line
968), which fills `this.tiles[y][x]` (logical: `tilled`/`wet`/`obstacle`) and
`this.ground[y][x]` (a Phaser `Image` per tile). To inject a custom map:
- For each editor cell, create the ground `Image` (mirror `MapScene`'s tile
  drawing) and set `this.tiles[y][x].obstacle` for solids
  (`addCollider()` adds the physics body).
- **Caveats to resolve first:** the farm world is a **fixed** `GRID_W × GRID_H`
  (derived from `plots.ts`, ~283×107) — a smaller editor map must be placed
  within it or the world size made dynamic; the save format, multiplayer
  "plots," and crop/farming systems all assume the homestead geometry. Don't
  break `loadSave()`/`saveState()` (`solana-valley:save`).

For the rendering + collision recipe, copy from `MapScene.ts`.

---

## 6. Asset locations (quick reference)

| Thing | Path |
| --- | --- |
| Saved maps (drop here) | `app/public/maps/*.json` |
| Tile manifest (game) | `app/public/sprout-tiles/tiles-manifest.json` |
| Tile PNGs (game) | `app/public/sprout-tiles/<pack>/...` (= `sheet.file` minus `tiles/`) |
| Tile manifest + PNGs (editor) | `map-editor/tiles-manifest.json`, `map-editor/tiles/` |
| Editor source / save logic | `map-editor/editor.js` (`serializeProject`) |
| Reference integration | `app/src/game/scenes/MapScene.ts` |
| World/tile constants | `app/src/game/constants.ts` (`TILE = 32`) |

233 sheets / 15,666 placeable tiles. Art: **Sprout Lands** by **Cup Nooble**
(see `CREDITS.md`; no NFT/AI-training use; the basic "Sorry" pack is
non-commercial).

---

## 7. Future work (optional, not required to integrate)

- Add a **collision/semantics layer** to the editor (walkable/solid/tillable/
  water/spawn) and include it in the export, so maps carry gameplay info instead
  of relying on the derived convention in §4.
- Behind-object occlusion (y-sort the player against tall objects) in `MapScene`.
- A spawn-point marker in the editor instead of "nearest walkable to centre."
