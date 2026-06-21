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
| **Entitlement** (`claimable`) | How much each wallet *may* claim | Server-computed, credited via `credit_reward` |
| **Payout** (the transfer) | Moving real tokens to the wallet | Treasury key, signed in `/api/claim` |

The payout is safe by construction (treasury can't be over-drained). **The thing
to get right is the entitlement.** Credit it only from signals that can't be
forged client-side — marketplace activity, on-chain stake, verified
milestones/discoveries — **never** from the in-game coin balance, which is
client-authoritative (`api/save.ts` stores it verbatim). Otherwise a modified
client farms an outsized share of a real pool. Today crediting is a manual/cron
step (`credit_reward`); wiring it to a real contribution score is the next task.

---

## Pieces

| File | Role |
|---|---|
| `supabase/rewards.sql` | `rewards` ledger + `reward_claims` log + atomic RPCs (`credit_reward`, `reserve_claim`, `finalize_claim`, `cancel_claim`). Run once in the Supabase SQL editor. |
| `app/api/rewards.ts` | `POST /api/rewards` — wallet-signed read of `{ claimable, claimed, pending, decimals, symbol }`. |
| `app/api/claim.ts` | `POST /api/claim` — reserve → on-chain transfer → finalize/cancel. |
| `app/src/chain/rewards.ts` | Client fetch/claim helpers + `formatAmount`. |
| `app/src/chain/RewardsClaim.tsx` | The claim widget (mounted in `App.tsx`). |
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
| `REWARD_DECIMALS` | `rewards.ts`, script | display/units; default `6` (pump.fun standard) |
| `REWARD_SYMBOL` | `rewards.ts` | default `$SPROUT` |

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

## Funding the treasury (the buyback bot)

The payout loop above is complete. *Filling* the treasury from revenue is an
off-chain job you run on a schedule — and it needs **no smart contract**:

1. **Claim fees** — venue-specific. For a pump.fun launch, claim creator fees;
   for an LP position, collect fees via the Raydium/Orca SDK; for a Token-2022
   transfer-fee mint, withdraw withheld fees. (This is the only venue-specific
   bit and the one piece to implement per how $SPROUT is launched.)
2. **Buy back $SPROUT** — swap the claimed SOL/USDC → $SPROUT via the **Jupiter**
   swap API, signed by the dev wallet.
3. **Top up the treasury** — transfer the bought $SPROUT to the treasury ATA (or
   just buy directly into it).

A keeper/cron (GitHub Action, Vercel cron, or a small server) runs steps 1–3 on
an interval. Solana has no native cron, so "auto-claim" = this scheduled job.

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
