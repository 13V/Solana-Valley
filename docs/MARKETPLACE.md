# Marketplace — design draft

A player-to-player marketplace where rare crops, fish, and mutations can be
**bought and sold for real value** (the launched **`$SPROUT`** token). This is the
M4 milestone from `ROADMAP.md`, drafted concretely against what's live today.

> Status: **DRAFT**. Nothing here is built yet. The current game is fully
> client-authoritative (coins, harvests, catches, mutations are all rolled in the
> browser). Read the **"Hard constraints"** section first — two of them gate the
> whole thing.

---

## 1. Goal

Turn the existing rare-item chase (Celestial crops, Rainbow mutations, Leviathan
Eel, etc.) into a **player-driven economy with real upside**: list a rare item,
another player buys it for `$SPROUT`, value moves between wallets. This is what
makes "grinding for the rare drop" actually matter.

Two currencies, kept distinct:

| Currency | What it is | Where it's used |
|---|---|---|
| **Coins** (in-game) | Soft currency, faucet from farming/fishing | Seed shop, upgrades, animals — the gameplay loop |
| **`$SPROUT`** (SPL token, **real**) | The launched token (see the CA in-game) | The marketplace settlement currency + fees |

Coins stay off-chain and free-to-earn (fun, fast). `$SPROUT` is the *trading*
layer — scarce, real, and only touched when players choose to trade.

---

## 2. Hard constraints (read before designing anything)

### 2a. Anti-cheat: client-rolled items can't carry real value
Today the client decides what you harvest/catch and what mutation it rolls. If a
Rainbow Celestial item can be sold for `$SPROUT`, a modified client can **mint
infinite money**. So: **an item is only tradeable for real value once its
existence + rarity is established on-chain**, not on the client's say-so. That's
exactly what roadmap **M2 (plots on-chain) + M3 (items on-chain)** exist to do —
they are prerequisites for a *real-money* marketplace.

→ Implication: ship the marketplace in **two phases** (below). Phase A needs no
on-chain trust; Phase B does.

### 2b. Art license blocks NFTs
The Sprout Lands art (Cup Nooble) license **forbids NFT use** (see `CREDITS.md` /
`CLAUDE.md`). So we **cannot** represent items/land as NFTs using the current
sprites. Options:
- Represent tradeable produce as **fungible SPL tokens** (one mint per
  species, amount = quantity). Fungible tokens are **not NFTs**, so this likely
  sidesteps the clause — but get the license read confirmed before shipping.
- Or commission/replace the art for anything that must be a unique NFT
  (mutated 1-of-1s, land deeds).
- **`$SPROUT` itself is a fungible SPL token and is fine.**

This pushes the v1 marketplace toward **fungible, stackable goods** (e.g. "5×
Gold Pumpkin") rather than 1-of-1 NFTs. Unique mutated items wait for an art
solution.

### 2c. Regulatory / "gambling" surface
Mutation value swings (×25 Rainbow) + real-money trade = lottery-like dynamics.
Keep it as **trading of earned goods**, never paid loot boxes, and add the
standard disclaimers. Flag for review before mainnet.

---

## 3. Phased rollout

### Phase A — off-chain marketplace, priced in coins (ship first)
A real, social player-to-player market that needs **no on-chain trust** and no
program — proves the UX and seeds liquidity.

- A Supabase `listings` table (like `shop_buys`): `{ id, seller_wallet,
  item_key, qty, price_coins, created_at, status }`.
- **List:** move the item out of your bag into the listing (server-verified the
  same best-effort way as the shop; coins are soft so abuse is low-stakes).
- **Buy:** atomic RPC `buy_listing(id)` — deduct buyer coins, credit seller
  coins, transfer the item. (Mirror the `buy_seed` atomic pattern.)
- **UI:** a "Market" panel (browse / my listings / sell), reusing the shop's
  list styling and the EventBus intent pattern (`ui:listItem`,
  `ui:buyListing`, `ui:cancelListing`).
- **Fee:** a small coin cut to a sink (anti-inflation).

*Outcome:* players trade rares for coins immediately. No real money yet, but the
whole flow (list/browse/buy/escrow/fees) is live and tested.

### Phase B — `$SPROUT` settlement (real money)
Swap the settlement currency from coins to `$SPROUT`, backed by on-chain escrow.
**Requires M2/M3 first** (items provably on-chain) per constraint 2a.

1. **Items on-chain (M3):** harvest/catch mints a **fungible SPL token** for the
   produce (one mint per species; rarity/mutation encoded as separate mints or
   metadata). Minting happens in a server/oracle path that checks the
   on-chain `planted_slot` (M2) — closing the cheat hole.
2. **Escrow program (Anchor):**
   ```
   Listing PDA { seller, item_mint, qty, price_lamports_sprout, bump }
   + a program-owned escrow token account holding the item.
   ```
   - `list(item_mint, qty, price)` → moves item into escrow, opens the Listing.
   - `buy(listing)` → buyer pays `$SPROUT` to seller (minus fee to treasury),
     receives the item from escrow, closes the Listing.
   - `cancel(listing)` → seller reclaims the item, closes the Listing.
3. **Client** signs `list`/`buy`/`cancel` with the connected wallet (reuse the
   existing wallet-auth). The Market panel reads open listings (indexer or RPC
   getProgramAccounts).

*Outcome:* rare items trade for real `$SPROUT` between wallets, trustlessly.

---

## 4. What's tradeable (v1)

Start narrow, expand later:
- **Harvested crops** by `species + mutation + quality` (the existing stack key).
- **Caught fish** by `species`.
Not v1: land/plots (needs NFT art), animals/trees (placed producers), upgrades.

Rarity floors: only allow listing **Rare+** items in Phase B (keeps the
real-money layer to things that are actually scarce; commons stay coin-only).

---

## 5. Fees & token sink (why this helps `$SPROUT`)

- **Marketplace fee:** e.g. 5% of each `$SPROUT` sale → treasury, of which a
  portion can be **bought-back/burned** to support the token, the rest funds
  development/liquidity.
- **Listing deposit (optional):** tiny `$SPROUT` deposit to list, refunded on
  sale/cancel — deters spam listings.
- This makes the marketplace a **genuine `$SPROUT` utility/sink**, not just a
  faucet.

---

## 6. Coins ↔ `$SPROUT` (do they connect?)

Recommended: **keep them separate.** Coins are the fun, inflationary gameplay
currency; `$SPROUT` is the scarce trading currency. Do **not** add a
"sell coins for `$SPROUT`" faucet — that turns gameplay grind directly into token
emission (inflation + a money-printing exploit surface). `$SPROUT` enters the
game only by players bringing it in (buying on a DEX) to purchase rare items from
other players. The marketplace is a **peer-to-peer** value transfer, not a mint.

---

## 7. UI sketch

A new HUD button ("🪙 Market") opening a panel with three tabs:
- **Browse** — open listings (filter by type/rarity/price), Buy button.
- **Sell** — pick an item from your bag, set qty + price, List.
- **Mine** — your active listings, Cancel.

Wire over the EventBus like every other panel (`ui:*` intents → FarmScene/network
handlers), so it drops into the existing React-overlay/Phaser split cleanly.

---

## 8. Risks / open questions

- **License (2b):** confirm fungible SPL item-tokens are acceptable, or budget
  art for NFTs.
- **Anti-cheat (2a):** Phase B is blocked until items mint on-chain behind an
  oracle — non-trivial Anchor + indexer work.
- **Liquidity:** a P2P market needs buyers holding `$SPROUT`; Phase A (coins)
  bootstraps activity while the token economy matures.
- **Indexing:** reading listings at scale wants an indexer (Helius/our own),
  not raw `getProgramAccounts`.
- **Compliance:** real-money trading of RNG-rarity goods — get a review.

---

## 9. Recommended next step

Build **Phase A** (Supabase-backed, coin-priced marketplace) now — it's
shippable without any on-chain trust, gives players a real trading loop today,
and de-risks the UX. Treat **Phase B** (`$SPROUT` escrow) as the milestone after
M2/M3 land the on-chain item ownership it depends on.
