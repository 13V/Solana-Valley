# Roadmap

Build order, smallest shippable steps first. Each milestone stays playable.

## ✅ M0 — Playable game (done)

The single-player game is feature-complete and polished:

- Procedural pixel-art world; animated character; collision; y-depth sorting.
- Core loop: hoe → plant → water → real-time growth → harvest → sell.
- **Economy:** 16 plants across 7 rarity tiers; restocking seed shop with
  rarity-weighted stock.
- **Mutations:** Shiny/Frosted/Gold/Rainbow + Wet bonus, with glow/sparkle FX
  and value multipliers.
- **Atmosphere:** day/night cycle + clock, vignette, fireflies, particle FX.
- **Persistence:** localStorage autosave/load of the full farm.
- Solana **wallet connect** (devnet): address + live SOL balance.
- React ↔ Phaser architecture over a typed EventBus; how-to-play onboarding.

## M1 — `$VALLEY` SPL token (the on-chain economy)

- Create the `$VALLEY` SPL token mint (devnet).
- On connect, derive/create the player's associated token account (ATA).
- Replace local coins with the on-chain `$VALLEY` balance.
- Shop buy/sell become real token transfers to/from a treasury.
- _Outcome:_ the money is real and portable across wallets.

## M2 — Land plots as NFTs (ownership + anti-cheat)

- Mint farm plots as NFTs (Metaplex Core or Token Metadata).
- Gate farming to plots the connected wallet owns.
- Store minimal planting state on-chain per plot (crop + planted-at slot) so
  harvest minting can be verified — closes the "client mints free produce" hole.
- _Outcome:_ players own their land; harvests are trustworthy.

## M3 — Items & inventory on-chain

- Harvested produce (and its rarity/mutation) as SPL tokens / NFTs.
- Harvest mints the produce to the player's wallet; inventory reads on-chain.

## M4 — Player-to-player marketplace

- Anchor escrow program: list an item for `$VALLEY`, fill, cancel.
- Marketplace UI (browse, list, buy). A real player-driven economy for the
  rare crops and mutations.

## M5 — Game depth

- Seasons & weather (weather-driven mutations, like Grow a Garden).
- More plants/tiers, fruit trees, animals, fishing, crafting.
- Energy/stamina, tool upgrades, expanding the farm.
- NPCs, quests, multiplayer/social.

## M6 — Polish & launch

- Optional hand-drawn art pass over the procedural placeholders.
- Audio, settings, accounts/cloud saves.
- Audit the on-chain programs; deploy to mainnet-beta.

---

### Cross-cutting tech notes

- **Anti-cheat:** anything that mints value (harvests, rewards) must be
  verifiable on-chain or via a trusted oracle — never trust the client. This is
  why M2 puts planting state on-chain.
- **Bundle size:** vendor libs (Phaser, web3) are split into cacheable chunks;
  consider lazy-loading the wallet layer before a public launch.
- **Offline growth:** currently crops pause while away (resume from saved
  progress). If we later simulate offline growth, gate it server/chain-side to
  avoid clock exploits.
