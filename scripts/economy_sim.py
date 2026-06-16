#!/usr/bin/env python3
"""Sprout Valley economy / reward-pool sanity model.

Answers one question: with REAL-REVENUE-ONLY funding (marketplace fees +
cosmetic sales + treasury staking yield), how big is the Community Harvest Pool
at different player counts, and what does that mean per player?

Everything here is an ESTIMATE built on explicit, conservative assumptions —
it's a sanity check on sustainability, not a forecast. In-game COINS are an
off-chain closed loop (not withdrawable); the pool pays out $SPROUT (+ scarce
SOL for top prizes), funded only by money that actually comes in.

Usage:  python3 scripts/economy_sim.py
"""
from __future__ import annotations
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Assumptions (tune these — they are deliberately conservative)
# ---------------------------------------------------------------------------
@dataclass
class Assumptions:
    # monetisation (free-to-play benchmarks: ~2-5% pay, modest ARPPU)
    payer_rate: float = 0.03           # share of MAU who buy cosmetics/premium
    arppu_usd: float = 8.0             # avg monthly spend per paying user (USD)

    # marketplace (player-to-player trades of rare crops/items)
    trader_rate: float = 0.12          # share of MAU who trade
    trades_per_trader_mo: float = 6.0
    avg_trade_usd: float = 4.0
    marketplace_fee: float = 0.05      # 5% protocol fee on each trade

    # treasury (seeded at launch from LP/mint proceeds), staked for yield
    treasury_usd: float = 75_000.0
    staking_apy: float = 0.07          # ~SOL staking

    # how revenue is split
    pool_share_of_revenue: float = 0.50  # half of fees+cosmetics -> reward pool
    # (treasury *yield* goes 100% to the pool; principal is never paid out)

    # distribution shape: rewards concentrate on engaged players, not everyone
    rewarded_share: float = 0.20       # ~top 20% of MAU receive meaningful payouts
    sol_topprize_share: float = 0.10   # 10% of the pool is converted to SOL for
                                       # headline seasonal/leaderboard prizes

A = Assumptions()
MAU_SCENARIOS = [100, 1_000, 10_000, 100_000]


# ---------------------------------------------------------------------------
# Revenue + pool model
# ---------------------------------------------------------------------------
def monthly_revenue(mau: int):
    cosmetics = mau * A.payer_rate * A.arppu_usd
    mkt_volume = mau * A.trader_rate * A.trades_per_trader_mo * A.avg_trade_usd
    mkt_fees = mkt_volume * A.marketplace_fee
    treasury_yield = A.treasury_usd * A.staking_apy / 12.0
    return cosmetics, mkt_volume, mkt_fees, treasury_yield


def monthly_pool(mau: int):
    cosmetics, _vol, mkt_fees, yield_ = monthly_revenue(mau)
    return A.pool_share_of_revenue * (cosmetics + mkt_fees) + yield_


# ---------------------------------------------------------------------------
# In-game coins/min context (off-chain, NOT withdrawable) — research figures
# ---------------------------------------------------------------------------
INGAME_COINS_PER_MIN = {
    "Early (Lv1-4, commons, few upgrades)": (3, 20),
    "Mid (Lv9-14, legendaries + upgrades)": (50, 300),
    "Late (Lv20+, divine+ , all upgrades/perks)": (500, 5000),
}


def fmt(x):
    return f"${x:,.0f}" if x >= 100 else f"${x:,.2f}"


def main():
    print("=" * 74)
    print("SPROUT VALLEY — reward-pool sanity model (real-revenue-only funding)")
    print("=" * 74)
    print("\nAssumptions (monthly, per MAU averages):")
    print(f"  cosmetics/premium : {A.payer_rate:.0%} pay, ${A.arppu_usd:.0f} ARPPU")
    print(f"  marketplace       : {A.trader_rate:.0%} trade, {A.trades_per_trader_mo:.0f} trades x "
          f"${A.avg_trade_usd:.0f}, {A.marketplace_fee:.0%} fee")
    print(f"  treasury          : ${A.treasury_usd:,.0f} staked @ {A.staking_apy:.0%} APY")
    print(f"  pool              : {A.pool_share_of_revenue:.0%} of fees+cosmetics + 100% of yield")
    print(f"  distribution      : to ~top {A.rewarded_share:.0%} of players; "
          f"{A.sol_topprize_share:.0%} of pool as SOL top prizes")

    print("\n" + "-" * 74)
    header = (f"{'MAU':>8} | {'cosmetics':>10} | {'mkt fees':>9} | {'yield':>7} | "
              f"{'POOL/mo':>9} | {'/rewarded':>10}")
    print(header)
    print("-" * 74)
    for mau in MAU_SCENARIOS:
        cosmetics, _vol, mkt_fees, yield_ = monthly_revenue(mau)
        pool = monthly_pool(mau)
        rewarded = max(1, mau * A.rewarded_share)
        per_rewarded = pool / rewarded
        print(f"{mau:>8,} | {fmt(cosmetics):>10} | {fmt(mkt_fees):>9} | {fmt(yield_):>7} | "
              f"{fmt(pool):>9} | {fmt(per_rewarded):>10}")
    print("-" * 74)

    # a worked example at 10k MAU
    mau = 10_000
    pool = monthly_pool(mau)
    sol_prizes = pool * A.sol_topprize_share
    sprout_pool = pool - sol_prizes
    rewarded = mau * A.rewarded_share
    print(f"\nWorked example @ {mau:,} MAU:")
    print(f"  Community Harvest Pool : {fmt(pool)}/mo  (a self-balancing season pool)")
    print(f"   - SOL top prizes      : {fmt(sol_prizes)}/mo  (headline seasonal/leaderboard)")
    print(f"   - $SPROUT broad pool   : {fmt(sprout_pool)}/mo  across ~{rewarded:,.0f} engaged players")
    print(f"   - avg engaged payout  : {fmt(sprout_pool / rewarded)}/mo "
          f"(top contributors earn multiples of this; casual players ~$0)")

    print("\nIn-game COINS/min (off-chain closed loop — NOT withdrawable):")
    for k, (lo, hi) in INGAME_COINS_PER_MIN.items():
        print(f"  {k:<46} {lo:>5,}-{hi:<5,} coins/min")

    print("\nTakeaways:")
    print("  * Rewards are MODEST and scale WITH the game (more trade/spend = bigger pool).")
    print("  * Sustainable real-money play = 'cozy bonus + seasonal prizes', NOT an income.")
    print("  * The pool can only pay out what comes in -> it can never death-spiral.")
    print("  * If you wanted 'a living wage per player' you'd HAVE to print/Ponzi. We don't.")
    print("=" * 74)


if __name__ == "__main__":
    main()
