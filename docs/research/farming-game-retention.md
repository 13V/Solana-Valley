# Farming-Game Progression & Retention — Research Report

How farming / life-sim / idle / web3 games across platforms handle **progression**
and **"locking players in"** (retention) — and what Solana Valley should (and
shouldn't) borrow.

> Method: a ~40-agent research fleet (web-sourced) covering ~30 specific titles
> across PC/console, mobile F2P, Roblox/web, and blockchain, plus cross-cutting
> mechanic themes. Some theme agents hit API rate limits mid-run; those areas are
> backfilled from the per-title findings and the sources that returned. Treat
> numbers as directional, agent-gathered (sources listed at the end).

---

## TL;DR — the 8 universal retention levers

Every successful farming game pulls some subset of these. Ranked by how well they
fit a **cozy, web3, fun-first** game like Solana Valley:

1. **A visible "what next?" ladder.** Goals/quests/tech-trees that always dangle a
   next reward (Stardew bundles, Dreamlight Dreamlight-duties, Sunflower expansions).
   *We have this: 50-goal questline + Master Gardener %.*
2. **Collection completion with teeth.** Museums/almanacs/Pokédex + *set bonuses*
   (Stardew, ACNH critterpedia, Ooblets). Completionism is the strongest *cozy*
   retention driver. *We have a 196-plant Almanac; it needs reward teeth.*
3. **Variable-ratio rare chase.** Mutations/shinies/rare drops = slot-machine
   "one more harvest" + shareable moments. This is literally why Roblox **Grow a
   Garden** went viral. *We have 15 mutations + quality + rarity — under-amplified.*
4. **Real-time timers as *appointment* mechanics.** A reason to come back at a
   time — healthy when there's **no pay-to-skip**. *Our growth is already this.*
5. **Recurring seasonal events/festivals.** Limited (but returning) content spikes
   return visits (ACNH holidays, Stardew festivals, Hay Day events). *We have 14
   flavor-only festivals — not yet wired to anything.*
6. **Daily quests / gentle streaks.** ~95% of mobile games use daily rewards; a
   well-run login system A/B-tested at **+210% D30 retention / +155% DAU**. Pitfall:
   punishing streak loss. *We have none yet (questline is one-time).*
7. **Async social / co-op shared goals.** Neighborhoods (Hay Day), regattas
   (Township), island visits (ACNH), co-op (Stardew). Social obligation is a huge
   multiplier. *We have presence + shared shop + chat — no shared goals.*
8. **Prestige / offline progress.** "Infinite" long tail (Egg Inc soul eggs, idle
   offline earnings). *We have mastery stars; no offline growth or prestige.*

---

## Platform comparison — how each *kind* of game retains

| | Premium PC/console | Mobile F2P | Web3 / P2E |
|---|---|---|---|
| **Core retainer** | Intrinsic goals, story, seasons, completion | Timers + energy + endless live-ops + co-op | Token earning + ownership + competitions |
| **Examples** | Stardew, ACNH, Story of Seasons, Sandrock, Coral Island, Sun Haven, Fae Farm, Roots of Pacha, Ooblets, Wylde Flowers, Slime Rancher | Hay Day, Township, FarmVille, Family Farm, Klondike, Gardenscapes, Merge Mansion, Sunrise Village, Egg Inc | Sunflower Land, Pixels, Farmers World, Town Star, Axie |
| **Monetization** | One-time purchase (+optional DLC) | Speed-ups, energy refills, gacha, passes | Tokens, NFTs, land, VIP subs |
| **Retention shape** | Very high D30 for genre (sim 20-30% D30) | High D1, fast decay; live-ops props it up | Spikes then **collapses** when token ROI falls |
| **Lesson for us** | This is our north star (cozy, intrinsic) | Borrow the *appointment + social* hooks, **skip the paywalls** | Borrow ownership; **avoid extractive tokenomics** (see graveyard) |

---

## Prioritized recommendations for Solana Valley

Mapped to what we already have and which file changes. Ordered by impact ÷ effort.

### Tier 1 — high impact, low risk, fits cozy ethos
1. **Collection *set bonuses* (Almanac with teeth).** When a player discovers every
   plant in a botanical family (all Berries, all Citrus…) that family permanently
   sells +10–15%. Turns the 196-plant Almanac from cosmetic into economically
   load-bearing, and makes each rare a compulsion trigger. → `collection.ts`
   (extend the existing collection-bonus system). *Echoes Stardew bundles + ACNH.*
2. **Wire the festivals to *do something*.** During each festival window, boost the
   themed thing: e.g. Mutation Moon → ×2–3 mutation odds; Harvest Gala → +sale
   price; a festival-exclusive rare seed in the shop for that window. Mark them
   **"back next cycle"** so it's anticipation, not toxic FOMO. → `events.ts`
   exposes `eventForDay()`; read it in `FarmScene` mutation/sale/shop sites.
3. **Daily quests (gentle).** 3 rotating daily objectives (harvest 20, catch 2 fish,
   sell 500) with coin/XP and a streak counter that has **catch-up / insurance**
   (miss a day, don't lose everything). Layer on top of the existing 50-goal
   questline. → new `dailies.ts` + `FarmScene` + a small HUD panel.
4. **"What's New" / festival toast on load + crop-ready surfacing.** The cheapest
   appointment-mechanic: tell returning players what changed and that crops are
   ready. → `Toasts`/`EventBus` (already exists).

### Tier 2 — strong, medium effort
5. **Rare-chase amplification + virality.** A "rare harvest!" celebration + a
   one-tap **share card** (screenshot w/ the rare crop + mutation). Grow a Garden's
   growth engine is *social bragging* about rare pulls. → FX in `FarmScene` + a
   share button.
6. **Async neighborhood goals.** A weekly shared island target (e.g. "island
   harvests 10,000 crops") everyone's solo play contributes to, with a shared
   reward. Low-friction, no forced grouping. → `multiplayer.ts` + a goal in `goals.ts`.
7. **Offline crop growth.** Crops keep growing while away; you return to a harvest.
   Classic idle appointment hook; fits real-time timers. (Anti-cheat note: keep it
   client-side for now like the rest of the economy.) → `FarmScene` growth load.

### Tier 3 — bigger / later
8. **Seasonal "Chapter" pass (cozy, non-predatory).** A time-boxed track of cozy
   rewards (cosmetics, seeds) with a generous free tier — Palia's non-expiring
   Lunar Path and Dreamlight's Star Path are the healthy templates. Could later tie
   a premium track to $VALLEY/cosmetics (never to power). → new system.
9. **Prestige "legacy" layer** past full completion (à la Egg Inc soul eggs):
   reset for a permanent small multiplier + a prestige cosmetic. → `progression.ts`.

---

## ⚠️ Web3 tokenomics — the graveyard (read before launching $VALLEY)

Every P2E farming economy we studied **spiked then collapsed**. The pattern is
identical and avoidable:

- **Axie Infinity:** SLP was an *uncapped faucet* with one weak sink (breeding);
  95% of players earned-and-sold. SLP fell ~98% ($0.40→$0.01); DAU 2.7M→350K. Root
  cause: hard-capped earning incompatible with uncapped supply = growth-dependent
  (Ponzi-ish) → death spiral.
- **Pixels:** BERRY inflated ~2%/day, was **sunset** and replaced with *off-chain,
  non-tradable* coins specifically to stop farmer-dumping. Lesson: keep the soft
  currency off-chain / untradable.
- **Farmers World:** infinite token supply, no burn/buyback, dev silence → collapse.
- **Sunflower Land:** actually engineered real sinks (burn %, "halvening," 30%
  withdrawal tax) — and *still* lost ~56% MAU / ~83% DAU in 3 months, because pure
  P2E ROI (~$0.90/day) can't retain without intrinsic fun.

**Principles for $VALLEY (so the game stays fun AND the token doesn't implode):**
1. **Fun-first, "play-and-own," not "play-to-earn."** The reason to play must be the
   game; the token is an ownership flourish. Extractive earners are mercenaries who
   leave the instant ROI dips — and take the economy down with them.
2. **No uncapped reward token.** If $VALLEY is ever minted from play, it needs a
   hard cap and/or real sinks (cosmetics, land, seasonal burns) ≥ faucet.
3. **Keep earned soft-currency off-chain / non-tradable** (we already do — in-game
   coins are local). Convert to on-chain value only through gated, sink-bearing
   actions — never a raw "harvest → mint" faucet.
4. **Anti-cheat is a prerequisite.** Our economy is client-side; you cannot safely
   mint real value from client-rolled harvests/mutations without an on-chain
   "planted-at-slot" record or oracle (already flagged in ARCHITECTURE.md). Resolve
   this *before* any real value is mintable, or bots will drain it.
5. Web3 **season passes** are trending toward "play-to-airdrop" (earn points by
   playing, claim at season end) and free-mint passes funded by treasury, not player
   purchase — a cleaner fit than a paid battle pass.

---

## 🚫 Dark patterns to AVOID (they conflict with a cozy game)

- **Energy gating *core* actions** (FarmVille/Merge Mansion/Klondike gate tilling /
  spawning behind energy). Never gate farming itself. Keep energy out, or only on
  optional side-activities.
- **Pay-to-skip timers** (Hay Day diamonds, Township T-cash). Keep growth timers;
  never sell the skip.
- **Punishing crop withering as coercion** (FarmVille's withering = loss-aversion
  guilt). We have a gentle 40% wilt penalty — keep it gentle, never total loss.
- **One-time-only, never-returning FOMO** exclusives → anxiety. Make festivals/seeds
  **recur** on the calendar.
- **Punishing streak loss.** Use streak insurance/catch-up (Duolingo-style streak
  freeze), not a hard reset to zero.
- **Manufactured difficulty to sell boosters** (Gardenscapes' tuned spikes).
- **Paid loot boxes / gacha for rares.** Our rare-chase must stay **earnable**, never
  purchasable — that's the line between exciting and predatory (and between legal and
  loot-box-regulated).

---

## Condensed per-title findings

**Premium life-sims**
- **Stardew Valley** — 5 auto-leveling skills + Lv5/10 professions; museum + shipping
  log (a "grow one of everything" Pokédex); seasonal calendar; relationships/marriage;
  free content updates. No MTX. *Take: seasonal calendar + completion log.*
- **Animal Crossing: NH** — real-time clock; Nook Miles daily challenges; museum +
  critterpedia (gold tools at 100%); IRL-calendar events that *recur yearly*. *Take:
  recurring seasonal events, completion rewards.*
- **Story of Seasons / Harvest Moon** — multi-year calendar; relationship/marriage
  that decays if neglected; festivals as engagement spikes. *Take: relationship-gated
  content, predictable festival cadence.*
- **Disney Dreamlight Valley** — Dreamlight-duty dailies/weeklies; Star Path
  (free+premium pass); ~2-month IP events. Cosmetics-only premium. *Take: tiered
  duties, cosmetic-only pass.*
- **Coral Island** — Town Rank gates unlocks across museum/ocean/heritage; diversified
  income forces daily variety; co-op. *Take: rank gating across multiple activities.*
- **My Time at Sandrock** — timed crafting commissions; workshop-rank leaderboard;
  relationships. *Take: timed commissions with tiered rewards.*
- **Sun Haven** — RPG skill trees, 10 tiers, endless scaling; cross-system loops.
  *Take: tiered skill unlocks + cross-tree synergies (grafting).* 
- **Fae Farm / Roots of Pacha** — co-op shared progress; furniture/decoration → stat
  bonuses; tech "ideas" tree. *Take: decoration-as-bonus, clan/shared goals.*
- **Ooblets** — creature collection (common/uncommon/gleaming) + breeding; town
  development gating. *Take: layered rarity collection (we have this in crops).*
- **Palia** — F2P cozy MMO; 200+ rotating daily quests w/ rerolls; **non-expiring**
  Lunar Path; cosmetics-only. *Take: rotating dailies + non-FOMO pass.*
- **Wylde Flowers / Slime Rancher 2** — narrative cadence; market-saturation pricing
  (flooding a crop crashes its price, recovers 25%/day → rotate crops). *Take:
  optional dynamic pricing to encourage crop variety.*

**Mobile F2P (borrow hooks, skip paywalls)**
- **Hay Day** — production timers (items wait, not spoil-to-zero on basics);
  neighborhood trading + town visitors every 6–8h; 24h+ events; diamonds sell
  speed-ups (the dark part). *Take: neighborhood request board. Avoid: pay-to-skip.*
- **Township** — co-op **Regattas** (6-day team competitions) are the retention
  engine; barn-capacity pressure (dark). *Take: async co-op competitions.*
- **FarmVille** — XP/levels, expansion, **withering crops** (loss aversion) + viral
  social asks. *Take: social asks (gentle). Avoid: withering coercion.*
- **Family Farm / Klondike / Sunrise Village** — energy-gated exploration; staggered
  crop timers; time-limited islands; daily login. *Take: staggered timers + daily
  login. Avoid: energy on core play.*
- **Gardenscapes** — match-3 funds garden; lives timer; narrative curiosity. *Take:
  narrative hooks tied to restoring the land. Avoid: manufactured difficulty.*
- **Merge Mansion / Sunrise Village** — merge dopamine + narrative mystery +
  energy gates. *Take: merge/mystery dopamine. Avoid: energy on core.*
- **Egg, Inc. (idle)** — research upgrades + **prestige (soul eggs)** + co-op
  contracts + offline earnings + a generous "piggy bank." *Take: prestige + offline
  progress + co-op contracts, all ethically.*
- **Farming Simulator** — equipment/land expansion; **mods/UGC**, multiplayer,
  realism mastery; DLC. *Take: build archetypes / specialization fantasy.*

**Web3 / Roblox**
- **Grow a Garden (Roblox)** — *the* direct comp; plant→sell→rarer seeds; **mutation
  RNG stacking** (sprinkler+weather+pets → 100×+ crops) is the endgame; idle growth;
  pet auto-mutation; **player trading**; viral via shareable rare pulls + low-friction
  press-E play. *Take: amplify mutation stacking + trading + shareability.*
- **Sunflower Land** — skill tree, expansions via NPC meals, 3-month **Chapters** with
  expiring resource tokens; engineered sinks; still churned (P2E ROI). *Take: seasonal
  chapters + sinks. Avoid: relying on earn for retention.*
- **Pixels** — daily energy (Sauna), professions 0–100, guild Spore Sports, VIP sub;
  killed tradable BERRY for off-chain coins. *Take: VIP/cosmetic sub + off-chain soft
  currency.*
- **Farmers World / Town Star / Axie** — see the graveyard above. Durability/repair
  loops and weekly competitions retained *while* tokens held value; all collapsed on
  inflation. *Take: weekly competitions + sinks. Avoid: uncapped faucets.*
- **Adopt Me (Roblox)** — limited-time eggs/pets (FOMO) + daily streak + deep
  player-trading economy; Neon upgrade tiers. *Take: trading + earned rarity tiers.
  Avoid: pure speculation / never-returning exclusives.*

---

## Case study: FarmVille (the canonical lock-in playbook — half cautionary)

FarmVille hit ~83M MAU / 34.5M DAU (2010) almost purely on retention/virality
engineering, not gameplay. What it teaches — the good and the toxic:

- **Appointment + loss aversion:** crops wither (2h–4d windows) if not harvested →
  daily compulsion framed as *avoiding waste*. Effective, but guilt-based. We use a
  *gentle* 40% wilt, not death — keep it that way.
- **Asymmetric social loop:** helping a neighbor is free for the giver, valuable for
  the receiver → reciprocity obligation. Rewards *degraded after the first ~20
  neighbors* (anti-runaway). Gift sending had 4h cooldowns + daily caps (anti-spam).
- **Forced network expansion:** farm expansions required ≥5 neighbors → recruitment
  was baked into progression. Powerful but coercive; we'd do an *opt-in* version.
- **Weekly leaderboards** (added 2012) with weekly resets drove consistent return.
- **Co-op jobs** with Gold/Silver/Bronze tiers added a second social bond.
- **What killed it:** growth depended on a Facebook notification *exploit*; when the
  API tightened (Sept 2010), DAU collapsed. Retention built on a borrowed firehose,
  not intrinsic fun, is fragile — the same lesson as the web3 P2E collapses.

**Net for us:** borrow the *async neighbor-help + weekly co-op leaderboard* loop and
reward-degradation tuning; reject withering-as-guilt, forced recruitment, and
spammy notifications.

## Retention benchmarks (directional, 2024–25 mobile data)

- Daily login rewards used by ~**95%** of mobile games. A login-progression system
  A/B-tested at **+210% D30 retention, +155% DAU, +90% LTV**.
- Genre D1 / D30: hyper-casual 20-30% / <2%; casual 30-45% / 5-10%; **simulation
  45-60% / 20-30%** (our genre — the stickiest casual category). Healthy DAU/MAU
  20-30%.
- Practitioner findings: escalating (not flat) reward calendars; **streaks add loss
  aversion**; daily rewards alone aren't enough — loop depth (quests/events/social)
  decides whether players stay; live-ops layered on dailies drive 2–3× participation.
- Variable-ratio (slot-machine) reward schedules are the most extinction-resistant
  engagement loop — and the most ethically loaded (loot-box/gambling research). Keep
  ours **earnable-only**.

---

## Sources (agent-gathered; representative)

Stardew/ACNH/Story of Seasons/Dreamlight/Coral Island/Sandrock/Sun Haven/Fae
Farm/Roots of Pacha/Ooblets/Palia/Wylde Flowers/Slime Rancher wikis & guides ·
deconstructoroffun.com (Hay Day, Township, Gardenscapes) · udonis.co (Merge
Mansion, retention psychology) · gamerefinery.com (appointment mechanics) ·
mobilefreetoplay.com (energy systems) · darkpattern.games · naavik.co (Sunflower
Land, Town Star, Pixels) · docs.sunflower-land.com · blog.roninchain.com (Pixels
BERRY sunset) · deconstructoroffun.com + coindesk + restofworld (Axie collapse) ·
Beebom/PocketTactics (Grow a Garden) · GameAnalytics / Mistplay / Solsten
(retention benchmarks) · PMC/NCBI + JEAB (variable-ratio / loot-box psychology) ·
Decrypt / DappRadar / BitPinas (web3 season passes). Full URLs are in the
per-agent briefs from this research run.
