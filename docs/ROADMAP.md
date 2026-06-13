# Roadmap

Build order, smallest shippable steps first. Each milestone stays playable.

## ✅ M0 — Playable vertical slice (done)

- Procedurally-rendered farm, player movement.
- Core loop: till → plant → water → sleep/grow → harvest.
- 3 crops, shop (buy seeds / sell produce), coin economy.
- Solana wallet connect (devnet): address + live SOL balance.
- React ↔ Phaser architecture via a typed EventBus.

## M1 — `$VALLEY` SPL token (the on-chain economy)

- Create the `$VALLEY` SPL token mint (devnet).
- On connect, derive/create the player's associated token account (ATA).
- Replace local coins with the on-chain `$VALLEY` balance.
- Shop buy/sell become real token transfers to/from a treasury account.
- _Outcome:_ the money is real and portable across wallets.

## M2 — Land plots as NFTs (ownership + anti-cheat)

- Mint farm plots as NFTs (Metaplex Core or Token Metadata).
- Gate farming to plots the connected wallet owns.
- Store minimal planting state on-chain per plot (crop id + planted-at slot) so
  harvest minting can be verified — closes the "client mints free produce" hole
  noted in ARCHITECTURE.
- _Outcome:_ players own their land; harvests are trustworthy.

## M3 — Items & inventory on-chain

- Harvested produce and tools as SPL tokens / NFTs.
- Harvest mints the produce token to the player's wallet.
- Inventory UI reads on-chain balances.

## M4 — Player-to-player marketplace

- Anchor program for listings + escrow: list an item for `$VALLEY`, fill, cancel.
- Marketplace UI (browse, list, buy).
- _Outcome:_ a real player-driven economy.

## M5 — Game depth

- More crops, seasons, and a real day/night clock.
- Animals, fishing, mining, crafting.
- Energy/stamina, tool upgrades.
- NPCs, quests, social features.

## M6 — Polish & launch

- Real art (tilesets, character sprites, animations) replacing the placeholder
  procedural graphics.
- Audio, save/load, settings.
- Audit the on-chain programs; deploy to mainnet-beta.
- Code-split the bundle (the Solana libs are large) and add asset loading.

---

### Cross-cutting tech debt to watch

- **Bundle size:** the web3/wallet libs push the JS bundle past 2 MB. Add
  `manualChunks` / lazy-load the wallet layer before launch.
- **Anti-cheat:** anything that mints value (harvests, rewards) must be verifiable
  on-chain or via a trusted oracle — never trust the client.
- **State persistence:** M0 keeps farm state in memory. Decide what persists
  off-chain (e.g., a backend or local save) vs. what's reconstructed from chain.
