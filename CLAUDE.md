# CLAUDE.md

Guidance for Claude (and other AI assistants) working in this repository.

## What this is

**Solana Valley** — a cozy, Stardew-Valley-style farming game with a
"Grow a Garden"-style rare-crop economy, built to run in the browser with a
Solana wallet/ownership layer. It is a single-player game today (fully playable)
with devnet wallet connect, optional cloud saves, and lightweight realtime
multiplayer presence. The on-chain token/land/marketplace program is the next
milestone (see `docs/ROADMAP.md`).

Start with `README.md` for the player-facing overview and `docs/ARCHITECTURE.md`
for the design. This file is the orientation map for making changes.

## Core principle: own on-chain, play off-chain

Real-time gameplay (movement, tilling, watering, growth timers, rendering) stays
**client-side** — instant and free. The things players *own and trade* (the
`$VALLEY` currency, land, items, marketplace) are the parts destined for
**Solana**. Crop growth is just a timer; what becomes on-chain is the *result* of
a harvest or sale. See `docs/ARCHITECTURE.md` for the full split and the
anti-cheat note (client-rolled growth/mutations must move behind an on-chain
"planted-at-slot" record or oracle before real value is minted).

## Architecture in one breath

Two runtimes share one screen, joined by a typed event bus:

- **Phaser owns the truth.** `app/src/game/scenes/FarmScene.ts` is the single
  source of game state (tiles, crops, inventory, coins, day clock, animals,
  skills, …). It is by far the largest file (~3k lines) and where most gameplay
  lives.
- **React is a thin overlay.** `app/src/ui/` renders HUD/hotbar/shop/panels from
  state snapshots and sends *intents*; it never mutates game state directly.
- **`EventBus`** (`app/src/game/EventBus.ts`) is the typed pub/sub bridge:
  Game → UI emits `state` / `clock` / `toast`; UI → Game emits `ui:*` intents
  (`ui:selectTool`, `ui:buySeed`, `ui:sellStack`, …). Keep this boundary intact —
  it's what lets on-chain handlers drop in later without restructuring gameplay.

The DOM overlay is `pointer-events: none` except on its own controls, so clicks
fall through to the Phaser canvas.

## Where things live

```
app/
├── api/                 # Vercel serverless functions (Node) — wallet-auth'd cloud save + rewards
│   ├── _auth.ts         #   ed25519 signature verification (service-role key, server-only)
│   ├── join.ts · save.ts · load.ts
│   ├── rewards.ts · claim.ts  # custodial $SPROUT reward payouts (treasury-signed) — docs/REWARDS.md
├── src/
│   ├── game/            # Phaser game logic (authoritative state)
│   │   ├── scenes/FarmScene.ts   # the big one: gameplay, growth, FX, save/load
│   │   ├── scenes/BootScene.ts   # procedural texture generation, then starts Farm
│   │   ├── economy.ts            # plants, rarity tiers, mutations, value math, shop rolls
│   │   ├── plots.ts · animals.ts · fishing.ts · forage.ts
│   │   ├── skills.ts · progression.ts (XP/levels)
│   │   ├── constants.ts · types.ts · input.ts · audio.ts (WebAudio SFX)
│   │   └── EventBus.ts · createGame.ts
│   ├── ui/              # React overlay (HUD, hotbar, shop, panels, tutorial, settings)
│   └── chain/           # Solana wallet + Supabase
│       ├── WalletProvider.tsx · useSolBalance.ts · walletAuth.ts
│       ├── supabase.ts (public anon client, realtime) · multiplayer.ts
│       ├── cloudSave.ts · CloudSaveSync.tsx · MultiplayerSync.tsx
│       └── rewards.ts · RewardsClaim.tsx  # claim real $SPROUT from the treasury
docs/   # ARCHITECTURE.md, ROADMAP.md, MARKETPLACE.md, REWARDS.md
programs/   # Anchor program (token/land/market) — planned, README only for now
scripts/    # fetch-assets.mjs (art); rewards-setup · reward-season · buyback · lib/contribution (reward ops — docs/REWARDS.md)
supabase/   # SQL run in the Supabase editor: shop.sql · rewards.sql · seasons.sql
```

> Note: `docs/ARCHITECTURE.md`'s module map predates several systems (animals,
> fishing, foraging, skills, plots, multiplayer, cloud save, the `api/` layer).
> Trust the tree above and the files themselves; update the docs if you touch
> those areas.

## Commands

```bash
npm install          # also runs scripts/fetch-assets.mjs (postinstall) to grab art
npm run dev          # Vite dev server → http://localhost:5173
npm run build        # tsc --noEmit + production build to app/dist
npm run preview      # serve the production build (port 4173)
npm run typecheck    # tsc --noEmit
```

There is **no test runner and no linter** configured. `npm run typecheck` (strict
TypeScript, `noUnusedLocals` on) is the gate — run it before committing changes
to `.ts`/`.tsx`. The build also typechecks.

Useful dev URL params (they disable autosave so they don't touch a real save):
`?fast=20`, `?give=strawberry:10`, `?mut=rainbow`, `?time=0.5`, `?rain=1`,
`?reset=1`.

## Conventions & gotchas

- **Adding a plant/crop:** edit `economy.ts`. New plants flow through the shop,
  seed picker, growth, harvest, and procedural texture generation automatically —
  don't hardcode crops elsewhere.
- **Game ↔ UI communication goes through `EventBus`.** Don't reach into Phaser
  state from React or vice versa.
- **All art/effects are procedural** — crop sprites, particles, glow, day/night
  tint, and sound (`audio.ts`, WebAudio, no audio files) are generated in code.
  The only external art is the licensed Sprout Lands pack.
- **Persistence:** `FarmScene` autosaves the full farm to `localStorage`; cloud
  save (`chain/cloudSave.ts` + `api/`) layers a wallet-signed backup on top.
- **Hosting:** primary deploy is **Vercel** (`vercel.json`). The GitHub Pages
  workflow (`.github/workflows/deploy.yml`) is a manual fallback only.

## Security / secrets

- The Supabase URL and **anon** key in `app/src/chain/supabase.ts` are public and
  safe to ship (protected by Row Level Security). Realtime multiplayer is
  serverless — peers coordinate via Supabase channels; there is no game server.
- The Supabase **service-role key** bypasses RLS and lives **only** in a
  server-only env var (`SUPABASE_SERVICE_ROLE_KEY`) used by `app/api/`. Never put
  it in client code or commit it.
- Cloud save auth: the browser signs a message once per session with the Solana
  wallet; `api/_auth.ts` verifies that ed25519 signature server-side before
  reading/writing a save. Don't weaken this path.
- **Treasury key (rewards):** `TREASURY_SECRET_KEY` signs real $SPROUT payouts in
  `api/claim.ts` and is a **server-only secret** — never in client code or commits.
  Reward *entitlements* must be credited from server-verified signals, never the
  client coin balance (which `api/save.ts` stores verbatim). See `docs/REWARDS.md`.

## Licensing constraint (important for the roadmap)

The Sprout Lands art (Cup Nooble) is included under a license that **forbids use
for anything NFT-related or AI training** — see `CREDITS.md`. The current build
(wallet connect + off-chain coins, no NFTs) is fine. A fungible `$VALLEY` SPL
token is *not* an NFT, but any roadmap feature that turns **land or items into
NFTs** is blocked on separate art/licensing. Flag this if asked to implement NFT
features with the existing assets.
