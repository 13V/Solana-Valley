# 🌱 Solana Valley

A cozy farming game in the spirit of **Stardew Valley**, with a **"Grow a
Garden"**-style rare-crop economy — built to run on the **Solana** blockchain.

Real-time farming runs in the browser (fast and free); the plan is for
**ownership and currency to live on-chain** — land/items as NFTs, an in-game SPL
token, and a player marketplace.

> **Status:** a polished, fully-playable single-player game (farming, economy,
> rare crops, mutations, day/night, autosave) with Solana **wallet connect** on
> devnet. The on-chain program (token / land / marketplace) is the next
> milestone — see [`docs/ROADMAP.md`](docs/ROADMAP.md).

All art is generated **procedurally in code** (no third-party sprites), so the
repo is self-contained and free of asset-licensing issues.

---

## Features

**Farming loop**
- Walk a hand-made world (cabin, trees, rocks, pond, wildflowers) with collision.
- Hoe grass → plant seeds → water → crops grow in **real time** (watering
  doubles growth speed) → harvest when ripe.
- Animated character (4-frame walk cycle), swaying trees, animated water.

**Grow-a-Garden economy**
- **16 plants across 7 rarity tiers** — Common → Uncommon → Rare → Legendary →
  Mythical → Divine → **Prismatic**. Rarer crops sell for *far* more.
- **Harvest mutations** that multiply value: Shiny (×2), Frosted (×8),
  **Gold (×20)**, **Rainbow (×50)** — plus a Wet bonus (×1.5) for watered crops.
  Rare/mutated crops **glow and sparkle**.
- A **restocking seed shop**: rare seeds only appear sometimes, so you check back
  and chase the good restocks.
- Inventory: a **Seeds** panel to choose what to plant and a **Harvest**
  backpack to sell stacks (or sell everything).

**Atmosphere**
- A **day/night cycle** with an in-game clock, sunrise/sunset tints, a vignette,
  and **fireflies at night**.
- Particle FX for watering, planting, harvesting, and rare-crop sparkles.

**Quality of life**
- **Autosave** to `localStorage` — your farm, coins, seeds, harvest, shop, and
  time all persist across reloads.
- A built-in **How to Play** panel (shown on first visit).

**Solana**
- Connect Phantom/Solflare (devnet); see your address and live SOL balance.
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

Other scripts:

```bash
npm run build      # typecheck + production build (app/dist)
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
```

To use wallet features, install [Phantom](https://phantom.app/), switch it to
**Devnet**, then click **Select Wallet**. Grab free devnet SOL from the
[faucet](https://faucet.solana.com/).

### Dev / debug URL params

Handy when developing or grabbing screenshots (these disable autosave so they
don't touch your real farm):

| Param | Effect |
| --- | --- |
| `?fast=20` | Multiply crop growth speed (e.g. for testing) |
| `?give=strawberry:10,pumpkin:3` | Grant seeds (and select the first) |
| `?mut=rainbow` | Force a mutation on every harvest (`gold`, `rainbow`, …) |
| `?time=0.85` | Start at a point in the day (0 = midnight, 0.5 = noon) |
| `?reset=1` | Clear the local save |

## Project structure

```
solana-valley/
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

> Devnet only for now — nothing here touches real funds.
