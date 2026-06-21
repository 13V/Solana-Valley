# Rewards & claims — custodial $SPROUT payouts

How players turn in-game contribution into **real $SPROUT** they can withdraw,
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
   Treasury wallet  ───────────────►  holds $SPROUT
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
| `scripts/buyback.mjs` | Ops CLI: fund the treasury by swapping SOL → $SPROUT on Jupiter. |
| `scripts/rewards-setup.mjs` | Devnet mint creation, treasury funding, and crediting test wallets. |

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
| `REWARD_MINT` | `claim.ts`, script | the $SPROUT mint address |
| `TREASURY_SECRET_KEY` | `claim.ts`, script | base58 64-byte secret key of the treasury wallet |
| `REWARD_DECIMALS` | `rewards.ts`, scripts | display/units; default `6` (pump.fun standard) |
| `REWARD_SYMBOL` | `rewards.ts` | default `$SPROUT` |
| `JUPITER_API` | `buyback.mjs` | swap API base; default `https://quote-api.jup.ag/v6` |

A `.env.example` at the repo root lists every variable.

The live $SPROUT mint is in `app/src/ui/ContractAddress.tsx`
(`3sPxGyKxwCrAebxZsFb56GsNd7mjK7jZAng5uJtPpump`). **Test on devnet first** with a
throwaway mint (below) before pointing `REWARD_MINT`/`TREASURY_SECRET_KEY` at
anything on mainnet.

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
#    shows "250 $SPROUT" → Claim → the tokens land in your wallet.

node scripts/rewards-setup.mjs balance   # sanity-check the treasury balance
```

---

## Crediting rewards: seasons & contribution score

Entitlements are credited per **season** using the capped-pool-by-share model: a
season has a fixed $SPROUT pool, and it's split across wallets *proportionally to
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

## Funding the treasury (the buyback bot)

The payout loop is complete; *filling* the treasury from revenue is an off-chain
job, no smart contract needed. `scripts/buyback.mjs` does the buy-back: the
treasury wallet swaps its SOL → $SPROUT on **Jupiter**, so tokens land straight
in the treasury's account, ready to claim.

```bash
node scripts/buyback.mjs balance          # treasury SOL + $SPROUT
node scripts/buyback.mjs quote 1.0        # dry-run: expected $SPROUT for 1 SOL
node scripts/buyback.mjs run 1.0          # execute (keeps 0.05 SOL reserve)
node scripts/buyback.mjs run 1.0 --slippage 150 --reserve 0.1
```

The one venue-specific step is getting SOL *into* the treasury — claiming
**pump.fun creator fees** (via PumpPortal's `collectCreatorFee` / the pump SDK),
LP fees (Raydium/Orca SDK), or Token-2022 withheld fees. `buyback.mjs claim-fees`
documents this; implement it for your launch venue so it deposits SOL into the
treasury wallet, then `run` swaps it. Drive the whole loop (claim → `run`, and
`reward-season.mjs distribute` each season) from a keeper/cron — GitHub Actions,
Vercel cron, or a small server. Solana has no native cron, so "auto" = a
scheduled job.

---

## Known limits (custodial v1) & the path to trustless

- **Hot wallet.** The treasury key lives on the server; it holds player funds.
  Keep the balance modest and rotate keys. This is the main reason to graduate to
  **Option B (a merkle-distributor program)** for mainnet scale — players self-
  claim against a published root, and you never hold a hot wallet full of rewards.
- **Transfer-confirmation edge.** If `sendAndConfirmTransaction` times out but the
  tx actually landed, the reservation is refunded (`cancel_claim`) while tokens
  moved — a rare double-pay window. Reconcile `reward_claims` against on-chain
  history; the merkle distributor removes this class of bug entirely.
- **Stuck `pending`.** If the server dies between reserve and finalize/cancel, the
  amount stays in `pending` (visible via `pending_at`). An operator finalizes or
  cancels it after checking the chain. The per-wallet `pending = 0` guard means a
  user can't start a second claim while one is stuck.

When real money is flowing at volume, migrate the claim step to a merkle
distributor (fork an audited one — Jito/Jupiter/Saber). The ledger, crediting,
and buyback bot here all carry over unchanged; only the payout swaps from a
server-signed transfer to an on-chain self-claim.
