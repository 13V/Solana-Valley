# 🌱 Farm Lands

A cozy farming game in the spirit of **Stardew Valley**, with a **"Grow a
Garden"**-style rare-crop economy — built to run on the **Solana** blockchain.

## ▶️ Play

- **Online:** https://13v.github.io/Farm-Lands/ (auto-deployed via GitHub Pages)
- **Locally:**
  ```bash
  git clone https://github.com/13V/Farm-Lands.git
  cd Farm-Lands
  npm install
  npm run dev --workspace app   # then open the printed http://localhost:5173
  ```

Real-time farming runs in the browser (fast and free); the plan is for
**ownership and currency to live on-chain** — land/items as NFTs, an in-game SPL
token, and a player marketplace.

> **Status:** a polished, fully-playable single-player game (farming, economy,
> rare crops, mutations, day/night, autosave) with Solana **wallet connect** on
> devnet. The on-chain program (token / land / marketplace) is the next
> milestone — see [`docs/ROADMAP.md`](docs/ROADMAP.md).

Visuals use the cozy **Sprout Lands** pixel-art + UI packs by Cup Nooble
(included under license — see [CREDITS](CREDITS.md)); crops and all effects
(particles, glow, day/night, sound) are generated procedurally in code.

## 🗺️ Map Editor

A standalone, drag-and-drop tile **map editor** lives under
[`map-editor/`](map-editor/) for building Stardew-style maps from the **Sprout
Lands** tilesets (233 tile sheets, ~15,666 placeable 16×16 tiles).

- **No build** — it's a plain static site (HTML/CSS/JS). Serve the folder over
  http and open it:
  ```bash
  cd map-editor && python3 -m http.server   # then open http://localhost:8000
  ```
  It must be served over **http**, not opened as a `file://` — it fetches a tile
  manifest at startup.
- **Auto-deploys** to GitHub Pages via the `deploy-map-editor.yml` workflow.
- See [`map-editor/README.md`](map-editor/README.md) for details.
- Tiles are **Sprout Lands** by Cup Nooble (https://cupnooble.itch.io/) — see
  [CREDITS](CREDITS.md).

---

## Features

**Farming loop**
- A **Grow-a-Garden-style server of 20 plots** — you farm your own allocated
  plot while 19 neighbours' gardens grow around you, in a larger world the
  **camera follows** you across. Your home (cabin, ranch, orchard, pond) sits
  at the top; the plot grid is below it.
- Hoe → plant seeds → water → crops grow in **real time** (watering doubles
  growth speed) → harvest when ripe — all inside your plot (the cursor turns red
  on anyone else's).
- Premium animated farmer: smooth 8-frame directional walk, per-direction idle
  breathing, and directional hoe / watering-can swings. Swaying trees, animated water.

**Grow-a-Garden economy**
- **19 plants across 8 rarity tiers** — Common → Uncommon → Rare → Legendary →
  Mythical → Divine → Prismatic → **Celestial**. Rarer crops sell for *far* more.
- **Harvest mutations** that multiply value: Shiny (×2), Frosted (×8),
  **Gold (×20)**, **Rainbow (×50)** — plus a Wet bonus (×1.5) for watered crops.
  Rare/mutated crops **glow and sparkle**.
- A **restocking seed shop**: rare seeds only appear sometimes, so you check back
  and chase the good restocks.
- Inventory: a **Seeds** panel to choose what to plant and a **Harvest**
  backpack to sell stacks (or sell everything).

**Progression**
- **Levels & XP** — harvesting earns XP; leveling up **unlocks higher rarity
  tiers** in the shop (work your way from carrots to Prismatic blooms).
- **Upgrades** (spend coins, permanent): bigger **Hoe**/**Watering Can** area
  (up to 7×7), **Fertilizer** (faster growth), **Fortune** (better mutation
  odds), **Shop Supply** (faster restocks), a **Sprinkler** (auto-waters your
  crops), and a **Market Stall** (higher crop sale prices).
- **Achievements** with coin rewards, and an **Almanac** tracking every plant
  and mutation you've discovered.
- **Ranch & Orchard** — passive income: buy **chickens** (eggs), **cows** (milk),
  and **fruit trees** (apple/orange/peach/pear), each unlocked by level. They
  produce on a timer; click to collect for coins + XP. Animals spawn in random
  **colours** (with a rare blue chicken / purple cow) and **breed** — keep a pair
  and baby animals appear and grow into adults, so your herd grows itself.

**Atmosphere**
- A **day/night cycle** with an in-game clock, sunrise/sunset tints, a vignette,
  and **fireflies at night**.
- **Weather**: passing showers roll in with falling rain and an overcast tint —
  and rain **waters every tilled tile for free** while it lasts.
- Particle FX for watering, planting, harvesting, and rare-crop sparkles.

**Quality of life**
- **Autosave** to `localStorage` — your farm, coins, seeds, harvest, shop, and
  time all persist across reloads.
- A built-in **How to Play** panel (shown on first visit).
- **Synthesized sound effects** (WebAudio, no audio files) with a HUD mute toggle.

**Solana**
- Connect Phantom/Solflare (mainnet-beta); see your address and live SOL balance.
- In-game coins are an off-chain placeholder for the planned `$VALLEY` SPL token.

## Controls

| Action | Input |
| --- | --- |
| Move | `WASD` or arrow keys |
| Select tool | `1` Hoe · `2` Watering Can · `3` Seeds (or click the hotbar) |
| Use tool on a tile | Click a tile within reach (cursor turns red if too far) |
| Harvest | Click a ripe crop |
| Shop / Seeds / Harvest / Help | Buttons in the top-left HUD |

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

> The Sprout Lands art (base + premium UI) is included in `app/public/assets/`
> under Cup Nooble's license, with attribution in [CREDITS.md](CREDITS.md).
> `scripts/fetch-assets.mjs` can re-fetch the base pack if needed. **Note:** the
> license forbids use in anything NFT-related — see CREDITS before building the
> on-chain NFT roadmap items.

Other scripts:

```bash
npm run build      # typecheck + production build (app/dist)
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
```

To use wallet features, install [Phantom](https://phantom.app/) (on
**Mainnet**), then click **Select Wallet**. Wallet connect is used only to read
your balance and to sign a one-off auth message for cloud save + multiplayer —
the game has no on-chain transactions yet, so connecting touches no real funds.

### Dev / debug URL params

Handy when developing or grabbing screenshots (these disable autosave so they
don't touch your real farm):

| Param | Effect |
| --- | --- |
| `?fast=20` | Multiply crop growth speed (e.g. for testing) |
| `?give=strawberry:10,pumpkin:3` | Grant seeds (and select the first) |
| `?mut=rainbow` | Force a mutation on every harvest (`gold`, `rainbow`, …) |
| `?time=0.85` | Start at a point in the day (0 = midnight, 0.5 = noon) |
| `?rain=1` | Start with a rain shower falling |
| `?reset=1` | Clear the local save |

## Project structure

```
farm-lands/
├── app/                        # game client (Vite + React + Phaser)
│   └── src/
│       ├── game/
│       │   ├── economy.ts       # plants, rarity tiers, mutations, value + shop
│       │   ├── constants.ts     # grid, timing, palette, tools
│       │   ├── EventBus.ts      # typed Phaser ↔ React bridge
│       │   └── scenes/
│       │       ├── BootScene.ts # procedural pixel-art texture generation
│       │       └── FarmScene.ts # gameplay, growth, economy, day/night, save
│       ├── ui/                  # React overlay: HUD, hotbar, shop/seeds/bag/help
│       └── chain/               # Solana wallet provider + hooks
├── programs/                    # Anchor program (token/land/market) — planned
└── docs/                        # ARCHITECTURE.md, ROADMAP.md
```

## How the blockchain fits in

The design splits the game **own-on-chain / play-off-chain**: real-time farming
stays client-side (instant, free), while the things players *own and trade* —
land, items, the `$VALLEY` currency, and the marketplace — go on Solana. The
game already routes economy actions through a typed event bus, so the on-chain
transaction handlers can drop in without restructuring gameplay. Details in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); build order in
[`docs/ROADMAP.md`](docs/ROADMAP.md); the Anchor plan in
[`programs/README.md`](programs/README.md).

> No on-chain transactions yet — wallet connect only reads your balance and
> signs an auth message, so nothing here moves real funds.
