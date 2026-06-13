# On-chain programs (planned)

This directory will hold the **Anchor (Rust)** programs that back Solana Valley's
ownership and economy. Nothing here is implemented yet — M0 is client-only with
wallet connect. This is the design we're building toward (see `docs/ROADMAP.md`).

## Planned programs / accounts

### 1. `$VALLEY` token (M1)
- A standard **SPL token** mint — no custom program needed, just mint + treasury.
- Players hold balances in their associated token account (ATA).
- Shop buy/sell = transfers between player ATA and a game treasury.

### 2. `farm` program (M2–M3)
Custom Anchor program holding gameplay ownership state.

- **Plot (NFT + state account):** each farm plot is an NFT; a companion PDA stores
  on-chain planting state so harvests are verifiable.
  ```
  PlotState {
    owner: Pubkey,
    crop: u8,            // 0 = empty
    planted_slot: u64,   // when planting happened (for grow-time checks)
    waterings: u8,
  }
  ```
- **Instructions (sketch):**
  - `plant(plot, crop)` — record crop + slot on a plot you own.
  - `harvest(plot)` — if enough slots/waterings have passed, mint produce to the
    owner and clear the plot. This is the anti-cheat gate: minting happens
    on-chain, not on the client's say-so.

### 3. `marketplace` program (M4)
Escrow-based player-to-player trading.

- **Listing PDA:** `{ seller, item_mint, price_in_valley, ... }` with the item
  held in a program-owned escrow token account.
- **Instructions:** `list`, `buy` (pay `$VALLEY`, receive item), `cancel`.

## Tooling (when we start)

```bash
# install Anchor via avm: https://www.anchor-lang.com/docs/installation
anchor init farm          # scaffolds a program
anchor build
anchor test               # local validator + TS tests
anchor deploy --provider.cluster devnet
```

The client already isolates chain calls behind `app/src/chain/`, and game actions
flow through the EventBus — so wiring these programs in means implementing the
`ui:buySeed` / `ui:sellCrop` / harvest handlers as transactions, without
restructuring the game.
