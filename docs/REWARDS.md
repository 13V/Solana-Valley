# Rewards & claims — custodial $LANDS payouts

How players turn in-game contribution into **real $LANDS** they can withdraw,
without a smart contract. This is "Option A" from the P2E discussion: a
**custodial** claim backend. The treasury is a normal wallet; our server signs
the payout transfer after verifying the player's wallet signature.

> Status: **implemented (devnet-ready)**, off by default. It activates only once
> the env vars below are set. With them unset, `/api/claim` returns
> `server not configured` and the claim widget never appears.

---

## The money flow

```
 pump.fun creator fees / marketplace fees  (REAL revenue in)
        │   (off-chain bot: claim → swap on Jupiter → transfer)
        ▼
   Treasury wallet  ───────────────►  holds $LANDS
        │
        │  player clicks "Claim"  (wallet-signed)
        ▼
   /api/claim  ──reserve──►  rewards ledger (Supabase)
        │                     (claimable → pending)
        ├──signs SPL transfer treasury → player ATA──► player's wallet ✅
        ▼
   finalize  (pending → claimed, logged)
```

The pool can **only ever pay out tokens the treasury actually holds**, and the
treasury is filled only by real revenue — so it's self-capping and can't
death-spiral (see `docs/MARKETPLACE.md` §6 / the tokenomics page).

---

## Two layers, kept separate

| Layer | What it is | Authority |
|---|---|---|
| **Entitlement** (`claimable`) | How much each wallet *may* claim | Server-computed: seasonal distribution by contribution score, or direct `credit_reward` |
| **Payout** (the transfer) | Moving real tokens to the wallet | Treasury key, signed in `/api/claim` |

The payout is safe by construction (treasury can't be over-drained). **The thing
to get right is the entitlement.** It's credited from a **contribution score**
(`scripts/lib/contribution.mjs`) weighted toward signals that are hard to fake —
discoveries, achievements, milestones — with **per-signal caps + diminishing
returns** so even a forged save can't dominate, and the in-game **coin balance is
deliberately ignored** (it's client-authoritative — `api/save.ts` stores it
verbatim). See [Crediting rewards](#crediting-rewards-seasons--contribution-score).

> ⚠️ Saves are still client-authoritative, so scores are *soft* until gameplay
> moves on-chain (roadmap M2/M3). The caps make forgery non-catastrophic, not
> impossible; an on-chain **stake** weight should multiply the score before this
> backs large sums. The capped-pool-by-share model also means forgery only
> *dilutes* the honest split — it can never drain more than the season's pool.

---

## Pieces

| File | Role |
|---|---|
| `supabase/rewards.sql` | `rewards` ledger + `reward_claims` log + atomic RPCs (`credit_reward`, `reserve_claim`, `finalize_claim`, `cancel_claim`). Run once in the Supabase SQL editor. |
| `app/api/rewards.ts` | `POST /api/rewards` — wallet-signed read of `{ claimable, claimed, pending, decimals, symbol }`. |
| `app/api/claim.ts` | `POST /api/claim` — reserve → on-chain transfer → finalize/cancel. |
| `app/src/chain/rewards.ts` | Client fetch/claim helpers + `formatAmount`. |
| `app/src/chain/RewardsClaim.tsx` | The claim widget (mounted in `App.tsx`). |
| `supabase/seasons.sql` | `seasons` + `season_scores` tables + atomic `distribute_season` RPC (capped-pool-by-share). Run after `rewards.sql`. |
| `scripts/lib/contribution.mjs` | Pure contribution scorer + largest-remainder pool allocator. |
| `scripts/reward-season.mjs` | Ops CLI: open a season, score all saves, split the pool, credit everyone in one atomic call. |
| `scripts/buyback.mjs` | Ops CLI: fund the treasury by swapping SOL → $LANDS on Jupiter. |
| `scripts/rewards-setup.mjs` | Devnet mint creation, treasury funding, and crediting test wallets. |
| `supabase/redemption.sql` | On-demand item→$LANDS pool: config + daily caps + atomic `redeem_items` RPC (credits `claimable`). |
| `app/api/redeem.ts` | `POST /api/redeem` — wallet-signed; credits claimable from the capped pool. |
| `app/src/chain/redeem.ts` + 🌱 button in `BagPanel.tsx` | Redeem a bag item for $LANDS on demand. |

Amounts are stored and transferred in **base units** (integer = whole tokens ×
10^decimals) so a payout never has float rounding.

---

## Environment variables (server-only)

Set these in the Vercel project (and locally for the script). They are **secrets**
— never commit them or expose them to the client.

| Var | Used by | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | both API routes | already used by save/load |
| `SUPABASE_URL` | the script | defaults to the project URL in the API routes |
| `SOLANA_RPC_URL` | `claim.ts`, script | required; use a paid RPC (Helius/QuickNode) on mainnet |
| `REWARD_MINT` | `claim.ts`, script | the $LANDS mint address |
| `TREASURY_SECRET_KEY` | `claim.ts`, script | base58 64-byte secret key of the treasury wallet |
| `REWARD_DECIMALS` | `rewards.ts`, scripts | display/units; default `6` (pump.fun standard) |
| `REWARD_SYMBOL` | `rewards.ts` | default `$LANDS` |
| `JUPITER_API` | `buyback.mjs` | swap API base; default `https://quote-api.jup.ag/v6` |

A `.env.example` at the repo root lists every variable.

After the pump.fun launch, set `REWARD_MINT` + `VITE_TOKEN_CA` to your **$LANDS**
mint. Until then the copy-pill falls back to the old $SPROUT mint
(`3sPxGyKxwCrAebxZsFb56GsNd7mjK7jZAng5uJtPpump`) in
`app/src/ui/ContractAddress.tsx`. **Test on devnet first** with a throwaway mint
(below) before pointing `REWARD_MINT`/`TREASURY_SECRET_KEY` at anything on mainnet.

---

## Quick start (devnet)

```bash
# 1. Run supabase/rewards.sql in the Supabase SQL editor.

# 2. Create a devnet mint + funded treasury (prints env vars to copy):
node scripts/rewards-setup.mjs create-mint

# 3. Put the printed REWARD_MINT / TREASURY_SECRET_KEY (+ SOLANA_RPC_URL,
#    REWARD_DECIMALS) and your SUPABASE_SERVICE_ROLE_KEY in the env.

# 4. Grant your own wallet some claimable to test the payout:
node scripts/rewards-setup.mjs credit <YOUR_WALLET> 250

# 5. Run the app, connect that wallet, approve the signature → the claim widget
#    shows "250 $LANDS" → Claim → the tokens land in your wallet.

node scripts/rewards-setup.mjs balance   # sanity-check the treasury balance
```

---

## Crediting rewards: seasons & contribution score

Entitlements are credited per **season** using the capped-pool-by-share model: a
season has a fixed $LANDS pool, and it's split across wallets *proportionally to
each wallet's contribution score*. No fixed "rate × coins" — your payout is your
share of a fixed pot, so it can never exceed the pool and inflating one number
can't game it.

```bash
# 1. Run supabase/seasons.sql in the SQL editor (after rewards.sql).

# 2. Open a season with a pool (whole tokens). Prints the season id:
node scripts/reward-season.mjs open 50000 "Season 1"

# 3. Preview the split — scores every save, shows the table, credits NOTHING:
node scripts/reward-season.mjs distribute 1 --dry-run

# 4. Commit it — credits every wallet's claimable in one atomic RPC, closes
#    the season (it can only ever be distributed once):
node scripts/reward-season.mjs distribute 1

node scripts/reward-season.mjs list   # see all seasons + status
```

**The score** (`scripts/lib/contribution.mjs`) weights discoveries/achievements
highest (breadth of contribution, naturally bounded), with diminishing returns
(`sqrt`/`log10`) and hard caps on grindable magnitudes (xp, harvested, earned) so
raw grind — or a forged number — can't run away. Coins are ignored. Tune the
weights/caps at the top of that file. For ad-hoc grants (e.g. bug bounties),
`scripts/rewards-setup.mjs credit <wallet> <amount>` still credits one wallet
directly.

---

## Trade top-tier crops for $LANDS (fixed amounts)

Harvest a **top-tier crop** and a 🌱 button appears on it in the Harvest panel —
trade it for real $LANDS on demand. Each tier pays a **fixed whole-token amount**
(`CLAIM_TOKENS` in `economy.ts` — no price feed, since a fresh token's price is
too volatile to peg to):

| Tier | Plants | Payout (× variant) |
|---|---|---|
| Divine | Blue Rose, Frost Pumpkin | **100,000 $LANDS** |
| Prismatic | Star Fruit, Moonpetal | **250,000 $LANDS** |
| Celestial | Galaxy Fruit, Voidbloom | **500,000 $LANDS** |

Everything below Divine (and fish) stays coins-only. **Divine and above can't be
sold for coins at all — the only way to cash them in is trading for $LANDS** (the
coin "Sell" button is hidden for them, and `sellStack`/`sellAll` refuse them).
**Special variants** multiply the payout, capped at 2× (`CLAIM_MUT_MULT`): Shiny
**1.25×**, Frosted **1.5×**, Gold **1.75×**, Rainbow **2×** — so a Rainbow Celestial
pays **1,000,000 $LANDS** (not the ×25 its in-game value implies). Quality stars
don't affect it. Payouts are clamped to a **capped daily pool**
(`supabase/redemption.sql`):

- **`daily_budget`** — most $LANDS payable per UTC day (the hard cap).
- **`wallet_daily_cap`** — most one wallet can take per day. Must be **≥ the
  largest single payout** (Rainbow Celestial = 1,000,000 $LANDS) or every redeem
  all-or-nothing-fails.
- **`base_rate = 1`** — the redeem API already computes the $LANDS base-unit
  amount, so the RPC just clamps it to the caps. Keep `rate_floor_bps = 10000`.

Flow: 🌱 → `POST /api/redeem {plantId, mutationId, count}` → the API computes the
fixed tier amount × variant × count and calls `redeem_items` to clamp + credit
`claimable`. The crop leaves the bag; the player withdraws via the same claim
widget — **no new payout path, and no price oracle**.

> ⚠️ Items are client-authoritative, so which crop is redeemed is the client's
> assertion. That's bounded because only 6 plants pay out, amounts are **fixed per
> tier**, and the daily/per-wallet caps hold no matter what. The real fix is
> on-chain items (M2/M3); until then keep the caps as small as the gameplay allows.
> **Off by default** (`enabled = false`); enable + fund via SQL:

```sql
update public.redemption_config set
  base_rate        = 1,             -- API computes the amount; RPC just clamps
  daily_budget     = 50000000000000, -- 50,000,000 $LANDS/day at 6 decimals (how much you fund)
  wallet_daily_cap = 2000000000000,  -- 2,000,000 $LANDS/wallet/day (≥ 1 Rainbow Celestial)
  rate_floor_bps   = 10000,         -- keep at 10000 (no floating)
  enabled          = true
where id = 1;
```

Also set **`LANDS_USD_PRICE`** (USD per $LANDS) so the per-tier values convert.

---

## Funding the treasury (the buyback bot)

$LANDS launches on **pump.fun**, so the treasury fills itself from **creator
fees** — no smart contract needed. **Launch $LANDS from the treasury wallet** so
creator fees accrue straight to it. The loop (`scripts/buyback.mjs`):

```bash
node scripts/buyback.mjs claim-fees --auto   # collect pump.fun creator fees → SOL in treasury
node scripts/buyback.mjs run 1.0             # swap that SOL → $LANDS into the treasury
node scripts/buyback.mjs balance             # treasury SOL + $LANDS
node scripts/buyback.mjs quote 1.0           # dry-run a swap (no send)
```

- **`claim-fees`** (no flag) prints the runbook; **`--auto`** collects via
  PumpPortal (verify the endpoint/action at https://pumpportal.fun, or just claim
  in the pump.fun UI — either way the SOL lands in the treasury).
- **`run`** swaps SOL → $LANDS on **Jupiter** into the treasury (keeps a 0.05 SOL
  reserve; `--slippage <bps>` / `--reserve <sol>` to tune). Needs a live $LANDS
  market for Jupiter to route — pump.fun gives you that immediately.

Drive the loop (`claim-fees --auto` → `run`, plus `reward-season.mjs distribute`
each season) from a keeper/cron — GitHub Actions, Vercel cron, or a small server.
Solana has no native cron, so "auto" = a scheduled job.

---

## Known limits (custodial v1) & the path to trustless

- **Hot wallet.** The treasury key lives on the server; it holds player funds.
  Keep the balance modest and rotate keys. This is the main reason to graduate to
  **Option B (a merkle-distributor program)** for mainnet scale — players self-
  claim against a published root, and you never hold a hot wallet full of rewards.
- **Transfer-confirmation edge (handled).** `api/claim.ts` refunds (`cancel_claim`)
  **only** when tokens definitively didn't move (send failed, or the tx confirmed
  with an on-chain error). On an ambiguous confirmation (RPC timeout — the tx may
  have landed) it leaves the claim `pending` with the signature stamped, so a
  landed-but-unconfirmed transfer is never refunded-then-repaid.
- **Stuck `pending` (self-healing).** Those left-pending claims are reconciled by
  **`scripts/reconcile-claims.mjs`** (run on a schedule —
  `.github/workflows/reconcile-claims.yml`, every 10 min): it checks each stuck
  signature on-chain and **finalizes** it (landed), **refunds** it (dropped/failed,
  after a grace period), or leaves it (still in-flight). Needs no treasury key. The
  per-wallet `pending = 0` guard means a user can't start a second claim while one
  is stuck — the cron clears it within ~15 min. Run reconcile against an RPC that
  retains transaction history so a landed tx is never misread as dropped.

When real money is flowing at volume, migrate the claim step to a merkle
distributor (fork an audited one — Jito/Jupiter/Saber). The ledger, crediting,
and buyback bot here all carry over unchanged; only the payout swaps from a
server-signed transfer to an on-chain self-claim.

---

## Trustless (merkle) distributor (Option B)

The graduation path from the custodial backend above. Instead of our server
holding a hot wallet and signing each payout, we publish a **merkle root** of the
season's `(wallet → amount)` allocations on-chain, fund a vault PDA once, and
**players claim themselves** against their proof. No server signs a transfer; the
only signature is the player's own wallet on the `claim` transaction.

> Status: **inert by default.** The client widget ships, but it renders nothing
> until the `reward_distributor` program is deployed and
> `VITE_REWARD_DISTRIBUTOR_PROGRAM` is set (see below). Until then the
> **custodial path (Option A) above still works** and is the active payout route.

### Why bother

It removes the two sharpest edges of the custodial model (see *Known limits*):

- **No hot wallet.** Rewards sit in an on-chain **vault PDA** that releases tokens
  only against a valid proof of the published root. There's no server-held key
  full of player funds to rotate or leak.
- **No custodial double-pay window.** The `claim_status` PDA is created atomically
  with the transfer, so a wallet can claim each leaf **exactly once** — the
  reserve/confirm/finalize race in `api/claim.ts` simply doesn't exist here.

The entitlement layer is unchanged: scores still come from
`scripts/lib/contribution.mjs`, with the same caps + diminishing returns and the
same "coin balance is ignored" rule. Only the *payout* mechanism differs.

### The flow

```
 contribution score  (scripts/lib/contribution.mjs — same as Option A)
        ▼
 scripts/merkle-season.mjs build   →  computes leaves + merkle root,
                                      publishes per-wallet proofs to Supabase
        ▼
 distributors row (root, mint, total)  +  distributor_claims rows (idx, amount, proof)
        ▼
 create the on-chain distributor   (programs/reward-distributor): init the
   distributor account with the root, fund its vault PDA, set distributor_pubkey
        ▼
 player connects wallet  →  MerkleClaim widget fetches their proof  →  builds &
   signs the `claim` tx themselves  →  vault → player ATA  ✅  (claim_status PDA
   marks the leaf claimed)
```

A distributor is **live** once its `distributor_pubkey` is written to the row
(i.e. the on-chain account exists and the vault is funded). The widget always
targets the **latest live** distributor (`order by season_id desc`).

### Data (public-read Supabase tables)

| Table | Columns | Role |
|---|---|---|
| `distributors` | `season_id, label, mint, root, total, distributor_pubkey, tx` | One row per season. `distributor_pubkey` null ⇒ not yet deployed (widget ignores it). |
| `distributor_claims` | `season_id, wallet, idx, amount, proof` | One row per wallet. `amount` is base units (string); `proof` is a JSONB array of 32-byte hashes as hex strings. |

Both are read with the **public anon client** (`app/src/chain/supabase.ts`) —
proofs and roots are public by design, so no wallet signature is needed to read
them.

### Client pieces

| File | Role |
|---|---|
| `app/src/chain/merkleClaim.ts` | Framework-agnostic logic: `getProgramId()`, `fetchActiveClaim(wallet)`, `isAlreadyClaimed(...)`, `buildClaimTransaction(...)`. Hand-encodes the Anchor `claim` ix and derives the `claim_status` / `vault` PDAs + the claimant ATA. |
| `app/src/chain/MerkleClaim.tsx` | The self-claim widget (separate from `RewardsClaim`). Uses the wallet adapter's `sendTransaction`; the player signs. Sits just above the custodial widget so the two don't overlap. |

The `claim` instruction layout the client encodes (must match the program):
discriminator `[62,198,214,193,213,159,108,210]` ++ `index` (u64 LE) ++ `amount`
(u64 LE) ++ `proof` (`Vec<[u8;32]>` = u32 LE length ++ length×32 raw bytes).
Accounts in order: `claimant` (signer, writable), `distributor` (writable),
`claim_status` PDA `["claim_status", distributor, claimant]` (writable),
`vault` PDA `["vault", distributor]` (writable), `claimant_token` ATA (writable),
`token_program`, `system_program`. The ATA-creation ix is prepended on first
claim (the claimant pays the rent).

### Environment variable (client, public)

| Var | Used by | Notes |
|---|---|---|
| `VITE_REWARD_DISTRIBUTOR_PROGRAM` | `merkleClaim.ts` / `MerkleClaim.tsx` | Base58 program id of the deployed `reward_distributor`. **Unset ⇒ the merkle widget is inert (renders nothing).** Unlike the `TREASURY_SECRET_KEY` etc. above, a program id is public — it ships in the client bundle (the `VITE_` prefix exposes it to the browser, as intended). |

Set it in the Vercel project (and locally) once `programs/reward-distributor` is
deployed; leave it unset to keep the merkle path dormant while the custodial
backend handles payouts.
