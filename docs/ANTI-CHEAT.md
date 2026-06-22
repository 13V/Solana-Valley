# 🛡️ Sprout Valley — Anti-Cheat & Authoritative State

The prerequisite for any real-value rewards. Today the game is **fully
client-authoritative**; this doc specifies how to make value-minting
**trustworthy** before `$SPROUT`/SOL is ever on the line.

Related: [`TOKENOMICS.md`](TOKENOMICS.md) · [`ROADMAP.md`](ROADMAP.md) (this is
milestone **M2**, and its "never trust the client" note).

---

## Why this is non-negotiable

Right now (`app/src/game/`):
- The **client computes everything** — growth, mutations (`economy.ts`
  `pickMutation`), crop value (`cropValue`), coins, XP (`FarmScene.ts`).
- State persists to **`localStorage`** (`solana-valley:save`), which any player
  can edit.
- Harvests effectively **mint value on the client**.

That's perfect for a free single-player game and **fatal** the moment a harvest
is worth real money: a user could edit the save to 10^9 coins, replay harvests,
warp the clock for instant growth, or script a bot to farm 24/7. **You cannot
attach money to client-trusted state.**

---

## Threat model

| Threat | Example | Mitigation |
|---|---|---|
| **Save tampering** | Edit `localStorage` coins/inventory | Server/chain is source of truth; client save is cache only |
| **Action forgery** | Fake "harvested Rainbow Voidbloom" events | Server validates every value-minting action against its own sim |
| **Clock / time-warp** | Set device clock forward for instant growth | Server owns time; growth computed server-side from server timestamps |
| **RNG manipulation** | Re-roll until a Gold mutation | Server-side RNG, or on-chain **VRF**, or commit-reveal |
| **Replay** | Resubmit a winning harvest tx | Nonces / idempotency keys per action |
| **Botting** | Scripts farm rewards 24/7 | Rate limits, behavioural detection, contribution scoring, caps |
| **Sybil** | 1 person, 10,000 wallets | Per-wallet caps, proof-of-personhood-lite, stake-to-earn |
| **Wash trading** | Trade with self to farm fee-funded rewards | Graph/heuristic detection; exclude self-dealing from scoring |

---

## Target architecture: authoritative server + on-chain settlement (hybrid)

Pure on-chain is too slow/expensive for real-time farming; pure server can't
prove ownership/currency. Use **both**:

```
client (Phaser/React)            authoritative server              Solana
─────────────────────            ────────────────────              ──────
predict + render          ──►   validate intents                  $SPROUT mint
emit ACTION INTENTS       ◄──   own the authoritative sim   ──►    plot NFTs
(plant/water/harvest/sell)      (time, growth, RNG, economy)       marketplace
local cache for UX              issue signed receipts       ──►    settlement
```

- **Client = prediction + rendering only.** It shows instant feedback but is
  never trusted. The existing **typed EventBus** (`EventBus.ts`) is the natural
  seam: economy actions already flow through it (per the README), so they become
  *intents sent to the server* instead of local mutations.
- **Server = the authority.** It runs the real economy (a server-side port of
  `economy.ts`), owns the clock and RNG, validates each intent, and is the only
  thing that can credit `$SPROUT`/rewards.
- **Chain = ownership & settlement.** Plot NFTs (who may farm where),
  `$SPROUT` balance, marketplace escrow, reward payouts. Anchor programs (see
  ROADMAP M2–M4).

---

## Key mechanisms

1. **Server-authoritative growth & harvest.** Plant/water/harvest are *intents*;
   the server computes elapsed growth from *its* timestamps and decides the
   outcome. The client's local timer is cosmetic.
2. **Provably-fair mutation RNG.** Either server-seeded RNG with published seed
   hashes (commit-reveal), or on-chain **VRF** for high-value rolls, so players
   can't re-roll and can verify fairness.
3. **Signed receipts / idempotency.** Each rewarded action carries a nonce; the
   server rejects replays and double-spends.
4. **Rate limits & caps.** Per-account actions/min, per-wallet daily reward caps,
   season caps — bound the blast radius of any exploit.
5. **Sybil resistance.** Proof-of-personhood-lite (e.g. a verification step for
   withdrawal), per-wallet caps, or **stake-to-earn** (must hold/stake `$SPROUT`
   to be reward-eligible) so fake accounts cost more than they earn.
6. **Bot / anomaly detection.** Flag inhuman cadence, 24/7 uptime, identical
   action patterns; gate rewards (not gameplay) behind it.
7. **Wash-trade detection.** Exclude self-dealing and circular trades from
   fee-funded reward scoring.
8. **Contribution scoring** (see TOKENOMICS) is itself anti-bot: rewarding
   discoveries/quality/social proof over raw volume makes botting low-ROI.

---

## Codebase impact

- **Extract the economy into a shared, server-runnable module.** `economy.ts`
  (plants, `pickMutation`, `cropValue`) and the growth/sell logic in
  `FarmScene.ts` move behind an authoritative API; the client keeps a copy only
  for *prediction*.
- **Turn EventBus economy events into server intents.** `ui:buyUpgrade`,
  plant/harvest/sell, etc. become RPC/websocket calls; the server's response is
  authoritative and the client reconciles.
- **Demote the save.** `localStorage` becomes a render cache + offline-friendly
  *single-player* mode; the authoritative balance/inventory come from
  server/chain. Add **cloud saves** alongside.
- **Add an accounts layer.** Wallet-linked identity; the reward layer keys off
  it.

> Single-player cozy mode can stay fully client-side and free forever. Only the
> **rewarded / on-chain mode** requires the authoritative path — keep them as
> distinct modes so the cozy experience isn't burdened by latency.

---

## Phased migration (= ROADMAP M2)

1. **Stand up the authoritative server** mirroring the current economy; run it
   in *shadow* (validate client actions, log mismatches) without gating anything.
2. **Flip harvest/sell to server-authoritative** for the rewarded mode; client
   becomes prediction-only there.
3. **Move ownership & currency on-chain** — plot NFTs gate farming; `$SPROUT`
   balance and marketplace settle on Solana.
4. **Add Sybil/bot defences + caps**, then and only then enable withdrawable
   rewards (with the KYC/geo gating from TOKENOMICS).

---

## Definition of done (before real money)

- [ ] No client-submitted value is trusted without server/chain validation.
- [ ] Growth, RNG, and economy outcomes are server/chain-owned.
- [ ] Replay, save-edit, and clock-warp exploits are closed.
- [ ] Per-wallet/season reward caps + Sybil resistance live.
- [ ] Bot & wash-trade detection gating the reward layer.
- [ ] Cloud saves + wallet-linked accounts.
