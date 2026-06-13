# 🌱 Solana Valley

A Stardew Valley–style farming game built on the **Solana** blockchain.

Real-time farming runs in the browser (fast and free); **ownership and currency
live on-chain** — land plots and items as NFTs, an in-game SPL token economy, and
a player-to-player marketplace.

> **Status: M0 — playable vertical slice.** You can walk a farm, till soil, plant,
> water, harvest, and buy/sell at the shop, with a Solana wallet connected on
> devnet. The on-chain program (token / land / marketplace) is the next milestone —
> see [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## What works today

- **Walkable farm** — move with `WASD` / arrow keys.
- **The core loop** — till grass into soil → plant seeds → water → **sleep to
  advance the day** → watered crops grow → harvest when mature.
- **3 crops** with different costs, growth times, and sell values (parsnip,
  potato, cauliflower).
- **Economy** — a shop to buy seeds and sell produce, with a coin balance.
- **Solana wallet** — connect Phantom/Solflare (devnet), see your address and
  live SOL balance. (In-game coins are an off-chain placeholder for the planned
  `$VALLEY` SPL token.)

## Controls

| Action | Input |
| --- | --- |
| Move | `WASD` or arrow keys |
| Select tool/seed | Click a hotbar slot, or press `1`–`5` |
| Use tool on a tile | Click the tile (must be within reach — highlight turns red if too far) |
| Harvest | Click a mature crop (any tool) |
| Sleep → next day | **Sleep** button (top-left) |
| Shop | **Shop** button (top-left) |

## Tech stack

| Layer | Choice |
| --- | --- |
| Game engine | **Phaser 3** (2D, WebGL/Canvas) |
| UI / wallet overlay | **React 18** |
| Wallet | `@solana/wallet-adapter` (Phantom, Solflare) |
| Chain RPC | `@solana/web3.js` (devnet) |
| Build tool | **Vite** + TypeScript |
| On-chain program | **Anchor (Rust)** — _planned, see `programs/`_ |

## Getting started

```bash
# from the repo root
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build      # typecheck + production build (app/dist)
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
```

To use the wallet features, install [Phantom](https://phantom.app/) and switch it
to **Devnet**, then click **Select Wallet**. You can airdrop devnet SOL with the
[Solana faucet](https://faucet.solana.com/).

## Project layout

```
solana-valley/
├── app/                      # game client (Vite + React + Phaser)
│   └── src/
│       ├── game/             # Phaser: world, scenes, state (authoritative)
│       │   ├── scenes/       # BootScene (textures), FarmScene (gameplay)
│       │   ├── constants.ts  # grid, crops, tools, economy tuning
│       │   └── EventBus.ts   # typed bridge between Phaser and React
│       ├── ui/               # React overlay: HUD, hotbar, shop, toasts
│       └── chain/            # Solana wallet provider + hooks
├── programs/                 # Anchor program (token / land / marketplace) — planned
└── docs/                     # ARCHITECTURE.md, ROADMAP.md
```

## How the blockchain fits in

The design splits the game cleanly:

- **Off-chain (client):** movement, tilling, watering, growth, rendering — anything
  that needs to be instant and free.
- **On-chain (Solana):** the things players actually *own* and *trade* — land
  plots, harvested items, the `$VALLEY` currency, and the marketplace.

This keeps gameplay snappy while making assets real, ownable, and tradable. The
full on-chain design lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and the
build order in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Notes

- All art is generated procedurally at runtime (simple shapes) — no third-party
  sprites — so the repo is self-contained and free of asset licensing concerns.
  Swapping in a real tileset/spritesheet is a later polish step.
- Devnet only for now. Nothing here touches real funds.
