# 🪙 Sprout Valley — `$SPROUT` Tokenomics & Player Rewards

How players earn real value for playing **sustainably** — without the Ponzi /
inflation / dark-pattern traps that killed most play-to-earn games.

> **Status:** design proposal. Numbers are starting points to tune, not
> promises. Nothing here is financial or legal advice — see
> [Legal & compliance](#-legal--compliance-must-clear-before-mainnet).

Related: [`ROADMAP.md`](ROADMAP.md) (on-chain milestones) ·
[`ANTI-CHEAT.md`](ANTI-CHEAT.md) (the hard prerequisite) ·
[`../scripts/economy_sim.py`](../scripts/economy_sim.py) (the model below).

---

## The core principle

> **Pay out real yield, never printed yield.** Every reward is funded by money
> that actually came in (marketplace fees, cosmetic sales, treasury staking
> yield). The reward pool can only distribute what it holds, so it can never
> death-spiral.

Why this matters: rewards can only be funded three ways — new-player inflows
(🪦 Ponzi, e.g. Axie/SLP), token emissions (🪦 inflation → price collapse), or
**real revenue** (✅ sustainable). We use only the third.

**Decisions locked in:**
- **Funding:** real revenue only (no per-play emissions).
- **Currency:** **`$SPROUT`** for broad/frequent rewards; scarce **real SOL** for
  headline seasonal & leaderboard prizes.
- **Tone:** cozy, not predatory — no gacha-for-cash, pay-to-skip, or FOMO walls.

---

## Two-currency design

The cozy game stays fast and free; real value lives only at the edges.

| Layer | Currency | On-chain? | Used for |
|---|---|---|---|
| **Coins** | in-game coins | ❌ off-chain | The entire cozy loop: seeds, upgrades, animals, day-to-day farming. Instant, free, fun. **Not withdrawable.** |
| **`$SPROUT`** | SPL token | ✅ on-chain | Marketplace currency, premium cosmetics, prestige, **withdrawable rewards**. |
| **SOL** | native | ✅ on-chain | **Top prizes only** (seasonal/leaderboard), paid from treasury yield/fees. |

This keeps 99% of play in the frictionless closed loop, and means a bot farming
*coins* gains nothing real — only the verifiable, capped reward layer touches
money.

---

## The Community Harvest Pool

A single, transparent, on-chain pool that **self-balances** — it pays out only
what it takes in each season.

**Inflows (real revenue):**
- A share of **marketplace fees** (P2P trades of rare crops/items) — the main engine.
- A share of **cosmetic / premium-seed sales**.
- **Treasury staking yield** (stake the SOL treasury; distribute the *yield*, never the principal).
- The **"harvest tax"** sink (a small % of high-value sales is routed to the pool).

**Outflows (capped to ≤ inflows):**
- **Seasonal rewards** split by *contribution score* (see below).
- **Quests / bounties** (fixed, capped spend).
- **Referral** rewards (a slice of fees from invited players).
- **SOL top prizes** (~10% of the pool, converted to SOL, for headline winners).

**Rule:** `season payout ≤ pool balance`. If revenue dips, payouts shrink — the
system bends, it never breaks.

---

## Sink / faucet ledger

The token only holds value if it's **consumed** at least as fast as it's earned.

| `$SPROUT` faucets (earn) | `$SPROUT` sinks (spend/burn) |
|---|---|
| Seasonal pool rewards | Premium / rare seeds |
| Quests & bounties | Land / plot expansion |
| Referral rewards | Cosmetic mints (skins, decor) |
| (one-time) cosmetic-first launch airdrop | Marketplace fees |
| | Prestige ("Replant the Homestead") |
| | **Burn-to-reroll** a mutation / guarantee a quality star |
| | The "harvest tax" |

Target: **sinks ≥ faucets** at all times. Burn-to-reroll and marketplace fees
are deflationary pressure that offsets reward distribution.

---

## Reward distribution — reward *contribution*, not *hours*

Paying per harvest/hour invites bots and ruins the cozy vibe. Instead, each
season the `$SPROUT` pool is split by a **contribution score** built from things
bots can't cheaply fake:

- **Almanac discoveries** (new crops/mutations found this season).
- **Collection / quality milestones** (set completion, high-quality harvests).
- **Achievements** unlocked.
- **Decorated-farm "likes"** from other players (social proof).
- Modest weight on volume — but **diminishing returns** so grinding doesn't dominate.

**SOL top prizes** go to a small leaderboard (rarest harvest, best-decorated
farm, seasonal challenge winners). Scarce and aspirational.

---

## What the model says (sanity check)

From [`scripts/economy_sim.py`](../scripts/economy_sim.py), with conservative
assumptions (3% pay @ $8 ARPPU; 12% trade @ 6×$4/mo, 5% fee; $75k treasury @ 7%
APY; 50% of revenue + 100% of yield → pool; rewards to ~top 20% of players):

| MAU | Cosmetics/mo | Mkt fees/mo | Treasury yield/mo | **Pool/mo** | Avg / engaged player |
|---:|---:|---:|---:|---:|---:|
| 100 | $24 | $14 | $438 | **$457** | $22.84* |
| 1,000 | $240 | $144 | $438 | **$630** | $3.15 |
| 10,000 | $2,400 | $1,440 | $438 | **$2,358** | $1.18 |
| 100,000 | $24,000 | $14,400 | $438 | **$19,638** | $0.98 |

\* tiny-MAU figure is dominated by the fixed treasury yield — noise, not signal.

**Worked example @ 10,000 MAU:** ~**$2,358/mo** pool → ~$236 in SOL top prizes +
~$2,122 in `$SPROUT` across ~2,000 engaged players. **Average engaged payout
~$1/mo**; top contributors earn multiples; casual players ~$0.

**The honest takeaway:** sustainable real-money play is a **cozy bonus + seasonal
prizes**, not a wage. It **scales with the game** (more trading/spend → bigger
pool). Wanting "a living wage per player" would *require* printing or a Ponzi —
which is exactly what we're refusing to do. The upside: this is defensible,
durable, and reputation-safe for a token brand.

*(In-game **coins** — the off-chain closed loop — still range from ~3–20/min
early to 500–5,000/min late; that pacing is unaffected and never withdrawable.)*

---

## `$SPROUT` supply & allocation (proposed)

Even with revenue-only rewards, the token launches with a fixed supply for
liquidity, treasury, and ops — **not** as a per-play faucet.

| Allocation | % | Vesting | Purpose |
|---|---:|---|---|
| Liquidity (DEX) | 30% | locked | Tradeable market so `$SPROUT` has real value |
| Community treasury | 25% | DAO/multisig | Backs the Harvest Pool, seasonal events |
| Ecosystem / future rewards reserve | 20% | slow release | Long-term, *not* auto-emitted |
| Team & dev | 15% | 1yr cliff, 3yr vest | Aligned, anti-dump |
| Launch airdrop (cosmetic-first) | 10% | — | Reward early players without cash incentive to farm |

Principle: **fixed supply, no inflationary reward emissions.** The treasury
funds rewards from *yield + revenue*, not by minting new supply.

---

## 🛡️ Anti-cheat is a hard prerequisite

The game is **100% client-side today** (localStorage save; the client computes
coins and "mints" produce). **You cannot attach real money to that** — it would
be drained in a day. Before any withdrawable reward exists, value-minting must
become **server- or chain-authoritative**, with Sybil/bot resistance. Full
design: [`ANTI-CHEAT.md`](ANTI-CHEAT.md). This is roadmap **M2**.

---

## ⚖️ Legal & compliance (must clear before mainnet)

**Not legal advice — engage a crypto-games attorney before any real-money
feature ships.** Open items:

- **Securities** — does `$SPROUT` pass *Howey*? "Earn by playing + expect price
  appreciation" is precisely what regulators scrutinise.
- **Gambling** — chance-based mutations that yield *withdrawable* value can be a
  lottery in many jurisdictions; burn-to-reroll especially.
- **Money transmission / KYC-AML** — withdrawals and airdrops often trigger this.
- **Tax** — possible reporting/withholding on rewards.
- **Geo-restrictions** — gate or disable earning where required (US especially).
- **Age / COPPA** — ⚠️ cozy games attract minors; paying minors real money is a
  serious risk. Likely need age-gating + geo-blocking on the earning layer.

---

## Phased rollout (maps to ROADMAP)

- **Phase 0 — now:** ship **anti-cheat** (server/chain-authoritative harvests)
  and a balanced **closed-loop** economy. Tune sinks/faucets while money is
  still fake. *Nothing withdrawable.*
- **Phase 1 — ROADMAP M1/M4:** mint `$SPROUT` (devnet→mainnet) as marketplace &
  premium currency with real sinks; ship the fee-taking marketplace.
- **Phase 2:** stand up the Community Harvest Pool (fees + yield); capped
  seasonal `$SPROUT` rewards + quests + referral; withdrawals behind KYC/geo gating.
- **Phase 3:** add **SOL top prizes** from treasury yield, capped.

---

## Risks & open questions

- **Liquidity:** thin `$SPROUT` liquidity = rewards are unsellable or instantly
  dumped. Liquidity depth is a launch gate.
- **Bot arms race:** contribution scoring helps, but expect ongoing tuning.
- **Regulatory drift:** rules change; keep the earning layer modular so it can
  be geo-gated or paused.
- **Cozy vs. earn tension:** monitor that rewards stay a *bonus*, not a job —
  if players feel obligated to grind, the design has failed.
