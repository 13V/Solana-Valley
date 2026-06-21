# Saved maps

Drop maps exported from the **Sprout Valley Map Editor** (`map-editor/`, click
**Save** → `sprout-map.json`) into this folder, named `<name>-map.json`.

- The game's **Explore mode** auto-loads `maps/<name>-map.json` when booted with
  `?map=<name>` (or press **`M`** in the farm for `sample`). You can also drag a
  `sprout-map.json` onto the window while in Explore mode.
- `sample-map.json` is a worked example (grass ground + a fence border + a pond).

**To integrate a saved map into the game**, hand it (plus this repo) to a Claude
Code session and point it at **`/MAP_INTEGRATION.md`** — that file has the full
format spec, tile-resolution rules, collision convention, and a pointer to the
working reference scene (`app/src/game/scenes/MapScene.ts`).
