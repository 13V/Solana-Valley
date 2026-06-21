# On-chain programs (planned)

This directory will hold the **Anchor (Rust)** programs that back Farm Lands's
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

### 3. `marketplace` program (M4) — **DRAFTED → `programs/marketplace/`**
Escrow-based player-to-player trading, settled in **`$SPROUT`** (the launched
token). The Anchor program is written (`programs/marketplace/src/lib.rs`):

- **`Marketplace` config PDA:** `{ admin, sprout_mint, treasury, fee_bps }`
  (fee capped at 10%).
- **`Listing` PDA:** `{ seller, item_mint, qty, price, nonce }`; the item sits in
  a program-owned **escrow** token account (authority = the Listing PDA).
- **Instructions:** `initialize`, `set_fee`, `list`, `buy` (pay `$SPROUT` →
  seller gets price − fee, treasury gets fee, buyer gets the item), `cancel`.

**Still to do before it's live (Phase B of `docs/MARKETPLACE.md`):**
- [ ] `anchor build && deploy` (devnet → mainnet); replace the placeholder
      `declare_id!`.
- [ ] **Items on-chain (M2/M3)** — produce must be a real SPL token minted behind
      an oracle (planted-at-slot check) or the escrow trades fakes. This is the
      real blocker; the escrow itself is mint-agnostic and ready.
- [ ] Client integration (`app/src/chain/marketplace.ts`): Anchor client +
      `list`/`buy`/`cancel` builders, wired via EventBus.
- [ ] Market UI panel (browse / sell / mine) + a listings indexer.
- [ ] Security **audit** + compliance review before mainnet.

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
