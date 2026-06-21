# Farm Lands Map Editor

A browser-based, Stardew-Valley-style tile map editor built around the
**Sprout Lands** pixel-art tilesets by **Cup Nooble**. It runs entirely in the
browser as a static, no-build website (plain HTML/CSS/vanilla JavaScript — no
npm, no framework, no bundler). Pick from thousands of 16×16 tiles, paint them
across multiple layers on a pan/zoom grid, and export your map as a PNG or save
the whole project to a JSON file.

The tile catalog spans **233 tile sheets** and **15,666 placeable tiles**,
sourced from the **Sprout Lands Premium** pack and the **Sprout Lands "Sorry"
(basic)** pack. Tile data lives in `tiles-manifest.json` and the images under
`tiles/`.

## Features

- **Searchable, collapsible tile sidebar** on the right, listing every tile
  grouped by its source folder.
- **Click to select** a tile, or **drag-and-drop** a tile straight from the
  sidebar onto the grid.
- **"Open sheet" view** to select a multi-tile rectangular stamp from a single
  sheet.
- **Infinite-feel grid canvas** with pan (space-drag or middle mouse) and zoom
  (mouse wheel).
- **Tools:** Paint, Erase, Eyedropper, Bucket fill, Rectangle, and Pan.
- **Multiple layers:** add, delete, rename, show/hide, reorder, and choose the
  active layer.
- **Configurable map size** (columns × rows).
- **Undo / redo.**
- **Autosave** to `localStorage`.
- **Save / load** the project as a JSON file.
- **Export** the finished map as a PNG.

## Usage

### Hosted (GitHub Pages)

This editor is deployed to GitHub Pages — the **root of the Pages site is this
editor**. Open the published Pages URL and start mapping; no install required.

### Run locally

The editor fetches `tiles-manifest.json` at startup, so it must be served over
**http** — opening `index.html` directly via `file://` will not work (the
browser blocks the fetch).

From inside the `map-editor/` directory, start any static file server. The
simplest is Python's built-in one:

```bash
cd map-editor
python3 -m http.server
```

Then open <http://localhost:8000> in your browser.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `B` | Paint / brush |
| `E` | Erase |
| `I` | Eyedropper |
| `G` | Bucket fill |
| `R` | Rectangle |
| `Space` (hold) | Pan |
| Mouse wheel | Zoom |
| `Ctrl`/`Cmd` + `Z` | Undo |
| `Ctrl`/`Cmd` + `Shift` + `Z` or `Ctrl` + `Y` | Redo |
| `[` / `]` | Zoom out / zoom in |
| `Delete` | Clear the current layer's selection |

## Credits / License

The tiles in this editor are from **"Sprout Lands"** by **Cup Nooble**.

- Artist: **Cup Nooble** — <https://cupnooble.itch.io/>
- Packs used: **Sprout Lands — Sprites (Premium pack)** and the
  **Sprout Lands "Sorry" (basic) pack**.

Required credit line (as given by the artist):

> Assets — From: Sprout Lands — By: Cup Nooble

### License terms (per the packs' `read_me.txt`)

- **Premium pack:** usable in **both non-commercial and commercial** projects.
- **Basic / "Sorry" pack:** **non-commercial** projects only.
- For **both** packs:
  - You may **not** redistribute the asset pack itself, nor resell it, even
    modified.
  - You **may** redistribute your own projects (games / software) made with the
    assets. **Open-source projects are explicitly allowed**, provided you
    include a note stating that some or all assets are by Cup Nooble, together
    with the licensing terms.
  - **Anything NFT-related or AI-training-related is not allowed.**

This editor **bundles the tiles for use within the tool itself** — it is **not**
a redistributable copy of the Sprout Lands asset pack. The tiles remain the work
of Cup Nooble and are credited as such. Note that because the basic ("Sorry")
pack is **non-commercial only**, **commercial use of maps made with this editor
is limited** by that restriction; commercial projects must use only the Premium
pack's tiles.

See the repository's root `CREDITS.md` for the full project-wide credits.
