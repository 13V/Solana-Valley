# Go-live runbook — $LANDS rewards

Everything's built and config-driven; this is the exact order to take it live.
Full design detail is in `docs/REWARDS.md` — this is the checklist.

## What only YOU can do (I can't — needs secrets / funds / deploy access)
- Hold the **treasury wallet** private key.
- Run the SQL + set secrets in **your** Supabase / Vercel.
- **Launch $LANDS** on pump.fun and fund the treasury.
- The **compliance** call on real-money trading of RNG drops.

## 0. Prereqs
- `npm install` at the repo root.
- The **service-role key** for the Supabase project the app points at
  (`app/src/chain/supabase.ts`).
- A Solana wallet for the treasury; Phantom/Solflare for testing as a player.
- Scripts read env from a local `.env` — run them with Node ≥20.6 as
  `node --env-file=.env scripts/<x>.mjs ...` (or export the vars).

---

## A. Devnet dry run (recommended — proves the whole loop, no real money)

1. **SQL:** in the Supabase SQL editor, run `supabase/rewards.sql` then
   `supabase/redemption.sql`.
2. **Test token + treasury:**
   ```bash
   node scripts/rewards-setup.mjs create-mint
   ```
   Copy the printed `REWARD_MINT`, `TREASURY_SECRET_KEY`, `SOLANA_RPC_URL`.
3. **Env:** put these in a Vercel **Preview** env (and a local `.env` for scripts):
   `SUPABASE_SERVICE_ROLE_KEY`, `SOLANA_RPC_URL` (devnet), `REWARD_MINT`,
   `TREASURY_SECRET_KEY`, `REWARD_DECIMALS=6`, `REWARD_SYMBOL=$LANDS`,
   `VITE_SOLANA_RPC` (devnet), `VITE_TOKEN_CA` (the devnet mint).
4. **Enable the pool** (SQL — full notes in `docs/REWARDS.md`). Trades pay FIXED
   token amounts (Divine 100K / Prismatic 250K / Celestial 500K × variant), so
   caps must be ≥ the largest single payout (Rainbow Celestial = 1,000,000):
   ```sql
   update public.redemption_config set
     base_rate = 1, daily_budget = 50000000000000,
     wallet_daily_cap = 2000000000000, rate_floor_bps = 10000, enabled = true
   where id = 1;
   ```
5. **Deploy the preview**, connect a devnet wallet, grab a top-tier crop fast with
   `?give=voidbloom:3&fast=20`, click **🌱 $LANDS** on it, then **Claim** from the
   reward widget → confirm the tokens arrive (devnet Solscan).
   - Shortcut to test crediting directly:
     `node --env-file=.env scripts/rewards-setup.mjs credit <YOUR_WALLET> 250`

If that works end-to-end, the system is real.

---

## B. Mainnet launch ($LANDS on pump.fun)

1. **Launch $LANDS on pump.fun FROM the treasury wallet** — so creator fees
   accrue straight to it. Note the mint address (the CA).
2. **Production env** in Vercel: `REWARD_MINT` = $LANDS CA, `TREASURY_SECRET_KEY`
   = treasury, `SOLANA_RPC_URL` = a **paid** mainnet RPC (Helius/QuickNode),
   `VITE_SOLANA_RPC` = mainnet, `VITE_TOKEN_CA` = $LANDS CA,
   `SUPABASE_SERVICE_ROLE_KEY`, `REWARD_SYMBOL=$LANDS`, `REWARD_DECIMALS=6`.
   (No price var — trade payouts are fixed token amounts.)
3. **SQL:** run `rewards.sql` + `redemption.sql` on the prod Supabase (once).
4. **Fund the treasury** with $LANDS:
   ```bash
   node --env-file=.env scripts/buyback.mjs claim-fees --auto   # creator fees → SOL
   node --env-file=.env scripts/buyback.mjs run 1.0             # SOL → $LANDS
   node --env-file=.env scripts/buyback.mjs balance             # verify
   ```
   (or just send some $LANDS to the treasury wallet to seed it.)
5. **Enable the pool** with **conservative caps** (items are forgeable until
   on-chain items / M2/M3 — keep `daily_budget` modest at first).
6. **Merge the branch** → Vercel deploys prod. (VITE_* are build-time, so deploy
   AFTER setting them.)

---

## Keep it running
- **Claim reconciliation (do this):** `.github/workflows/reconcile-claims.yml`
  already runs `scripts/reconcile-claims.mjs` every 10 min — it self-heals any
  stuck `pending` claim against the chain. Just set the repo secrets
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SOLANA_RPC_URL` (no treasury key
  needed). Until set, it no-ops.
- **Funding + seasons** on a schedule (GitHub Actions / Vercel cron):
  ```bash
  node --env-file=.env scripts/buyback.mjs claim-fees --auto && node --env-file=.env scripts/buyback.mjs run 1.0
  node --env-file=.env scripts/reward-season.mjs distribute <id>   # if you run seasons
  ```
- Watch `redemption_log` + `reward_claims` in Supabase for anomalies.

## Before mainnet
- Keep the treasury balance **modest** (it's a hot wallet) and caps tight.
- Get the **compliance** review (real-money RNG drops).
- Trustless upgrade later: deploy `programs/reward-distributor` + audit, set
  `VITE_REWARD_DISTRIBUTOR_PROGRAM` (then players self-claim, no hot wallet).
