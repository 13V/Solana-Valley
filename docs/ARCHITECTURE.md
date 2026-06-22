# Architecture

Farm Lands is a browser game with an on-chain ownership/economy layer. This
doc explains the on-chain/off-chain split, the client architecture, and how the
pieces talk to each other.

## The core principle: own on-chain, play off-chain

Blockchains are great at **ownership, scarcity, and trade** and bad at
**real-time, high-frequency state**. So we split accordingly:

| Concern | Where | Why |
| --- | --- | --- |
| Movement, tilling, watering, growth timers, rendering | **Client (off-chain)** | Must be instant and free; no one needs to verify each footstep |
| `$VALLEY` currency balance | **On-chain (SPL token)** | Real, fungible, tradable money |
| Land plots | **On-chain (NFT)** | Scarce, ownable, rentable/sellable |
| Harvested goods & equipment | **On-chain (NFT / token)** | Player-owned inventory that can be traded |
| Marketplace listings & trades | **On-chain (program)** | Trustless P2P trade, no central server |

Crop *growth* stays off-chain (it's just a timer). What becomes on-chain is the
**result**: when you harvest, you mint/credit an owned item; when you sell, an
on-chain trade settles in `$VALLEY`.

> Anti-cheat note: because growth is client-side, a production version needs the
> on-chain mint of harvested goods to be gated by a server/oracle or by an
> on-chain "plot planted at slot N" record, so clients can't mint free produce.
> See ROADMAP M2 — this is why land plots carry on-chain planting state.

## Client architecture

Two runtimes share one screen:

```
┌──────────────────────────────────────────────┐
│  React overlay (DOM)                           │  ← HUD, hotbar, shop, wallet
│   ─ pointer-events only on controls            │
│  ┌──────────────────────────────────────────┐ │
│  │  Phaser canvas                             │ │  ← world, player, crops
│  │   ─ authoritative game state               │ │
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
                 ▲          │
        emit ui:* │          │ emit state / toast
                 │          ▼
            EventBus (typed pub/sub)
```

- **Phaser owns the truth.** `FarmScene` holds tiles, crops, inventory, coins,
  and the day counter. It's the single source of game state.
- **React is a thin overlay.** The HUD/hotbar/shop render from snapshots and send
  *intents* (select tool, buy, sell, sleep) — they never mutate game state
  directly.
- **`EventBus`** (`app/src/game/EventBus.ts`) is a small typed emitter connecting
  them:
  - Game → UI: `state` (full `UiState` snapshot), `toast` (transient message).
  - Game → UI also: `clock` (day / time-of-day / restock countdown, ~1Hz).
  - UI → Game: `ui:selectTool`, `ui:selectSeed`, `ui:buySeed`, `ui:sellStack`,
    `ui:sellAll`.

The overlay is `pointer-events: none` except on its own controls, so clicks fall
through to the Phaser canvas everywhere else.

### Module map

```
app/src/
├── game/
│   ├── createGame.ts      # Phaser.Game config + scene registration
│   ├── economy.ts         # plants, rarity tiers, mutations, value + shop rolls
│   ├── constants.ts       # grid, timing, palette, tools
│   ├── types.ts           # UiState / ClockState (UI snapshot shapes)
│   ├── EventBus.ts        # typed Phaser ↔ React bridge
│   └── scenes/
│       ├── BootScene.ts   # generates all textures procedurally, then starts Farm
│       └── FarmScene.ts   # gameplay: growth, economy, day/night, FX, save/load
├── ui/
│   ├── App.tsx            # mounts Phaser into a div; lays out the overlay
│   ├── Hud.tsx            # clock, coins, wallet, panel buttons
│   ├── Hotbar.tsx         # hoe / watering can / selected-seed
│   ├── Shop.tsx           # rarity-colored seed shop with restock timer
│   ├── SeedsPanel.tsx     # choose which owned seed to plant
│   ├── BagPanel.tsx       # harvest stacks (mutation + value), sell / sell-all
│   ├── HelpPanel.tsx      # how-to-play (shown on first visit)
│   ├── Toasts.tsx         # transient notifications
│   └── useGameState.ts    # `useGameState` + `useClock` hooks (with state cache)
└── chain/
    ├── WalletProvider.tsx # Connection + Wallet + Modal providers (devnet)
    └── useSolBalance.ts   # live SOL balance for the connected wallet
```

## Gameplay model (current)

- The world is a `GRID_W × GRID_H` grid of `Tile { tilled, wetUntil, obstacle }`.
- Crops live in a `Map<"x,y", Crop>`. Each `update(dt)` advances `grownMs` by the
  frame delta (×2 while the tile is wet); a crop matures when it reaches its
  `growthSeconds`. On maturity it rolls a mutation and gains glow/sparkle FX.
- **Day/night** is a continuous clock (`timeMs`); an ambient overlay tints the
  scene by time of day. The shop restocks on a timer.
- **Economy data** (plants, rarity tiers, mutations, value math, shop rolls)
  lives in `economy.ts` — add a plant there and it flows through the shop, seed
  picker, growth, harvest, and texture generation automatically.
- **Persistence:** `FarmScene` autosaves the full farm (tiles, crops with their
  mutation, seeds, harvest, coins, shop, time) to `localStorage` and restores it
  on load. Dev URL params disable this so demos stay deterministic.

> Anti-cheat reminder: growth and harvest mutations are rolled client-side today.
> Before any real on-chain value is minted, this must move behind an on-chain
> "planted-at-slot" record or a trusted oracle (ROADMAP M2).

## Solana integration (current vs planned)

**Current (M0):** wallet connect on devnet via `@solana/wallet-adapter`. The app
reads the connected address and live SOL balance. In-game coins are local state.

**Planned:** a `chain/` service layer wraps the Anchor program client so the game
emits the same `ui:*` intents, but `buySeed`/`sellCrop`/`harvest` resolve to
on-chain transactions (SPL token transfers, item mints, marketplace fills). The
EventBus boundary means the UI and game logic barely change when this lands — we
swap the handler implementations, not the architecture. See `programs/README.md`
and `docs/ROADMAP.md`.
