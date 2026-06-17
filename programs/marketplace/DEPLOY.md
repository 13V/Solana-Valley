# Marketplace — deploy & go-live runbook

The escrow program (`src/lib.rs`) is written. It can't be built/deployed from the
web sandbox (no Rust/Solana toolchain, no key custody), so this is the exact path
to take it live on a machine that has the toolchain. Order matters.

## 0. Prereqs
- Rust + Solana CLI + Anchor (`avm install latest`) — https://www.anchor-lang.com/docs/installation
- A funded deployer keypair (`solana-keygen new`; airdrop on devnet).
- The **`$SPROUT`** mint address (already live — it's the CA shown in-game).

## 1. Build + deploy the program (devnet first)
```bash
cd programs/marketplace
anchor build
# grab the generated program id and put it back in the source + Anchor.toml:
anchor keys list
#   marketplace: <PROGRAM_ID>
# -> replace the placeholder in declare_id!(...) with <PROGRAM_ID>, rebuild:
anchor build
anchor deploy --provider.cluster devnet
# commit the generated IDL (target/idl/marketplace.json) into the repo for the client.
```

## 2. Initialize the marketplace config (once)
Call `initialize(fee_bps)` with:
- `sprout_mint` = the $SPROUT mint
- `treasury` = a $SPROUT token account you control (collects fees)
- `fee_bps` = e.g. `500` (5%, hard-capped at 10%)

(Do this with a small TS script using the IDL, or `anchor run`.)

## 3. THE REAL BLOCKER — tokenize items (roadmap M2/M3)
The escrow trades SPL token mints. Until harvested produce/fish are **real SPL
tokens**, there's nothing legitimate to list. You need:
1. **One SPL mint per tradeable item** (e.g. `gold_pumpkin`, `leviathan_eel`), or a
   small set keyed by species+rarity. Mint authority = a game treasury/PDA.
2. **An oracle-gated mint path** so a modded client can't conjure items:
   - Minimal (devnet/early): a serverless `api/mint-item` that the client calls on
     harvest/catch; the server (service key) mints the item token to the player's
     ATA. ⚠️ This still trusts the client — acceptable on devnet, NOT for real
     value at scale.
   - Trustworthy (mainnet): record planting on-chain (`farm` program, M2) and mint
     only when `harvest` verifies the planted-at-slot. This closes the cheat hole.
- Decide the **fungible vs NFT** question first (license forbids NFTs — see
  `docs/MARKETPLACE.md` §2b). Fungible per-item mints are the safe default.

## 4. Client integration (front-end)
Add deps (`@coral-xyz/anchor`, `@solana/spl-token`) and create
`app/src/chain/marketplace.ts` using the committed IDL:
- `listItem(itemMint, qty, priceSprout)`, `buyListing(listing)`, `cancelListing(listing)`
  — build/sign with the connected wallet (reuse the existing wallet adapter).
- `fetchListings()` — via an indexer (Helius/Triton) or `getProgramAccounts`
  filtered to the `Listing` discriminator (fine at small scale).
- Gate everything behind env: `VITE_MARKETPLACE_PROGRAM_ID`, `VITE_SPROUT_MINT`.
  When unset, the Market UI shows "coming soon" and the live game is unaffected.

## 5. Market UI panel
A panel (browse / sell / mine) wired over the EventBus like the Shop. Buy/sell/
cancel call the client module above. Only mounted when the env config is present.

## 6. Before mainnet
- [ ] **Audit** the program (escrow drain, fee math, account substitution).
- [ ] **Compliance review** — real-money trading of RNG-rarity goods.
- [ ] Fund/secure the treasury; document buy-back/burn policy.
- [ ] Switch `--provider.cluster mainnet`, redeploy, set mainnet env.

## What's done vs. pending
- ✅ Escrow program (`src/lib.rs`): config, listing, escrow, list/buy/cancel, fee.
- ⏳ Everything in steps 1–6 above (needs a toolchain + the item-mint layer).

The program is intentionally **mint-agnostic**, so step 3 (item tokenization) is
the only hard dependency between "program written" and "players trading for real
$SPROUT". That's the recommended next build.
