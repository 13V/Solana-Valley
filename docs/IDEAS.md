# 🌱 Sprout Valley — Ideas & Content Backlog

A living menu of everything we *could* build, plus the research behind it. This
is the **wide backlog**; [`ROADMAP.md`](ROADMAP.md) is the **committed build
order** (the on-chain milestones M0–M6). Most gameplay ideas here flesh out
roadmap **M5 — Game depth**.

**How to use this doc:** skim the [Next 10](#-next-10-highest-impact) for what
to pull next; the [catalog](#-the-catalog) is the full idea space grouped by
area. Tags: 🍓 = quick win, 🟦 = medium, 🏔️ = big bet.

> Naming note: the project is moving to the brand **Sprout Valley / `$SPROUT`**
> (the in-game token, currently the `$VALLEY` placeholder in code).

---

## 🎯 Next 10 (highest impact)

1. **Almanac-as-power** + a rolled-up **"Master Gardener %"** meter — keeps low
   tiers relevant and gives the game a north-star. 🟦
2. **Unify XP** (fishing/foraging/achievements grant global XP too) + **fill the
   Lv 9→36 unlock dead zone** so every level gives *something*. 🍓
3. **Cooking + processing stations** (jam/juice/wine) — huge economy depth from
   crops we already have. 🏔️
4. **Decoration / farm customization** — cozy retention *and* shareable farms
   for the Twitter brand. 🟦
5. **A pet companion (the cat mascot!)** with passive luck/growth buffs. 🟦
6. **Daily tasks + daily shop rotation + offline growth** (retention loop). 🟦
7. **Real co-op / visiting** on the existing 20-plot shared world. 🏔️
8. **Festivals + seasons + more weather** (live-ops backbone). 🏔️
9. **Cozy prestige — "Replant the Homestead"** (endgame). 🏔️
10. **Cloud saves + economy-sim tests** before any on-chain money is involved. 🟦

---

## 📊 Current systems & known issues (research snapshot)

Grounding for the ideas below — what exists today and where it's thin.

**Leveling** (`progression.ts:8–12`, `skills.ts:20–154`, `economy.ts:95–104`)
- Global level: per-level XP `60·i^1.5`, no cap. Unlocks seed rarity tiers at
  **L1/2/5/9/14/20/28/36** and animals/trees at **L3/4/6/8/12/16**.
- Five skill trees (Farming/Ranching/Breeding/Fishing/Foraging), max 20 +
  endless mastery stars; 1-of-2 perk forks at **Lv 5/10/15**, capstone at 20.
- Issues: **fishing/foraging/achievements don't grant global XP**; a big
  **content dead zone** between Legendary (L9) and Celestial (L36); skill perks
  are **permanent with no respec**.

**Upgrades** (`progression.ts:46–69`)
- 7 upgrades, cost `base·(lvl+1)²`, **no level gating** (~70.4k coins to max all):
  Hoe/Water (AoE), Fertilizer (+15%/lvl growth), Fortune (+20%/lvl mutation
  weight), Shop Supply (−20s/lvl restock), Sprinkler (auto-water), Market
  (+10%/lvl sale price).
- Issues: upgrades are a **coin check, not a choice** (you buy all 7);
  **Fortune** is the priciest yet weakest (still ~77% Normal at max) and its
  effect is **invisible**; **Hoe/Water tiers 2–3** are redundant vs `REACH=2`;
  **Fertilizer + Sprinkler** stack to near-instant growth; **Market** is the
  dominant ROI but gives no feedback on sale.

**Economy** (`economy.ts:27–156`, `animals.ts:58–91`, `constants.ts`)
- 8 rarity tiers, value ~3.7×/tier, grow-time ~1.2×/tier (value/time explodes at
  Divine+). Mutations: Normal ~86%, Shiny ~12% (×2), Frosted ~1% (×8), Gold
  ~0.3% (×20), Rainbow ~0.1% (×50); Wet ×1.5. Start 300 coins; restock 120s;
  day 8 min.
- Issues: low tiers go obsolete once high tiers unlock; mutation variance is
  swingy; passive income (animals/trees) lags active farming until mid-game.

---

## 🗂️ The catalog

### 🌾 Farming & crops
- Crop **quality stars** that multiply value (raised by fertilizer/skills). 🟦
- **Seasonal crops** (only grow in-season; off-season is slow/withers). 🟦
- **Giant crops** (a 3×3 of one crop merges into one big harvest). 🟦
- **Multi-harvest crops** (berries/tomatoes regrow on a timer). 🍓
- **Trellis/vine crops** that block movement (layout puzzle). 🟦
- **Adjacency combos** (plant X by Y for +value/luck). 🟦
- **Soil quality / crop rotation / compost**; **weeds & pests** maintenance. 🟦
- **Seed crossbreeding** → chance at new hybrid species. 🏔️
- **Greenhouse** (grow anything, weatherproof). 🟦
- **Watering can fill** from the pond as a light resource loop. 🍓

### ✨ Mutations & rare-crop economy
- **Environmental mutations** that stack (Chilled/Sunlit/Stormstruck/Moonlit),
  additive bracket × the rarity variant for a controllable ceiling. 🟦
- **Event mutations** during festivals (e.g., "Spooky", ×big). 🟦
- **Live mutation preview** ("what could this become?") + visible odds. 🍓
- **Lucky-harvest streaks** that build a temporary luck bonus. 🍓
- **Burn/reroll**: spend currency to reroll a mutation or guarantee a star. 🟦

### 🛠️ Tools & upgrades (beyond the 7)
- **Hold-to-charge AoE tools** so big sweeps are deliberate. 🟦
- **Branching final upgrade tiers** (Sprinkler: Wide vs Misting; Market:
  Wholesale vs Connoisseur). 🟦
- **Rebalance pass**: buff Fortune + show odds; cap/rework Hoe/Water tiers;
  diminishing returns on Fertilizer+Sprinkler; sell-feedback juice on Market. 🍓
- **Inventory/backpack expansions**; **fertilizer types** (speed/quality/luck). 🟦
- **Auto-planter / auto-harvester** robots (idle automation). 🏔️
- **Tool skins** (functional + cosmetic). 🍓
- **Plot blueprints** (save a layout, replant in one click). 🟦

### 📈 Skills, leveling & progression
- **All activities grant global XP**; **respec** (first free, then coin cost). 🍓
- **Almanac-as-power** (each discovery = small permanent global +%). 🟦
- **"Master Gardener %"** rolled-up completion meter. 🟦
- **New skill tracks** (Cooking/Crafting/Mining/Trading); **scarce skill-point
  tree** so you specialize. 🏔️
- **Titles/ranks** shown on profile; **daily/weekly mastery challenges**. 🍓
- **Fill the unlock dead zone** with per-level rewards (decor, recipes, QoL). 🟦

### 🐔 Animals & ranch
- **Pet** (cat/dog) you pet daily for buffs. 🟦
- **Animal happiness/affection** → product quality. 🟦
- **More animals**: sheep, goats, ducks, **bees** (honey + pollination buff),
  pigs (truffles). 🟦
- Deeper **genetics/breeding** for rare colours & traits. 🟦
- **Barns/coops** as capacity-tiered buildings; **auto-feeders**. 🟦
- **Mounts** (ride to move faster). 🟦

### 🌳 Orchard, fishing, foraging & gathering
- **Fishing minigame** depth (bait, tackle, legendary fish, a display tank). 🟦
- **Foraging seasons + respawn nodes**; rare gems/truffles. 🟦
- **Tappable trees** (syrup/resin) for crafting mats. 🍓
- **Bug catching** + a bug collection. 🟦
- **Aquaculture** (fish ponds, crab pots). 🏔️

### 🍳 Cooking, crafting & processing
- **Cooking** → dishes that give temporary buffs (luck/speed/energy). 🏔️
- **Processing stations**: Keg/Jar/Mill/Loom to re-monetize cheap crops. 🟦
- **Crafting** upgrades & decor from gathered mats; **recipe discovery**. 🟦

### ⛏️ New zones & exploration
- **Mines/caves** (floors, ore, gems; cozy puzzles or light combat). 🏔️
- **Town hub** with shops & NPCs; **forest/beach/mountain** biomes. 🏔️
- **Mystery plots** (ticketed resource runs). 🟦
- **Map + fast travel**; **secret areas** unlocked by progression. 🟦

### 🏡 Building, decoration & customization
- **Decoration mode** (paths, fences, lamps, statues, signs). 🟦
- **House upgrades** & furniture; **farm layout editor** / terraforming. 🏔️
- **Plot themes/biomes** (snowy, desert, magical). 🟦
- **Placeable trophies** from achievements/events. 🍓
- **"Show farm" / visiting mode** to tour decorated plots. 🟦

### 👥 NPCs, relationships, story & quests
- **Townsfolk** with schedules, dialogue, gift prefs; **friendship/marriage**. 🏔️
- **Quest board** (grow/fetch X) + a **main narrative** (restore the valley)
  with a Community-Center-vs-corporate **branching fork**. 🏔️
- **Mail** delivering rewards & story; **reputation** affecting prices. 🟦

### 🎉 Festivals, seasons, events & weather
- **Seasonal festivals** (harvest fair, flower dance, fishing derby) w/ prizes. 🏔️
- **More weather** (storms, snow, fog, heatwave, rare rainbow luck event). 🟦
- **Real calendar/seasons**, birthdays, limited seasonal crops. 🟦
- **Live-ops events** (global community goals, leaderboards). 🟦
- **Random events** (traveling merchant, meteor seed, wandering critter). 🍓

### 🗃️ Collections, museum & achievements
- **Museum/gallery** (crops/fish/bugs/gems) with **set-completion bonuses**. 🟦
- **Achievements that grant power**, not just coins. 🍓
- **Photo mode** + screenshot gallery (brand fuel). 🟦
- **Passport/stamp book** of milestones. 🍓

### 🔁 Daily loops & retention (cozy, non-predatory)
- **Rotating daily tasks** (no streak punishment). 🟦
- **Daily shop rotation** with a rare-seed slot. 🍓
- **Offline/idle growth** with a soft cap; **staggered grow-timers**. 🟦
- **Login calendar** of small (cosmetic-leaning) gifts. 🍓
- **"Garden mortgage"** expansion gate — pay at your pace, no fail state. 🟦

### 🏆 Endgame & prestige
- **Cozy prestige** ("Replant the Homestead": lifetime coins → permanent
  Heirloom-Seed bonuses, keep cosmetics/Almanac, cube-root scaled). 🏔️
- **New Game+ modifiers**; **infinite "deep farm"** ascending plots. 🏔️
- **Flagship megaproject sink** (Greenhouse/Statue) for huge late coin piles. 🟦
- **Leaderboards** (richest farm, rarest harvest, fastest to Celestial). 🟦

### 🌐 Multiplayer & social (the 20-plot world already exists)
- **Real co-op** — visit & water neighbours' crops; **gifting/trading**. 🏔️
- **Player marketplace** (P2P stalls); **guilds/farm-towns** with shared goals. 🏔️
- **Competitive seasons**; **farm visiting + likes** → cosmetic currency. 🟦
- **Chat/emotes**; a **global rare-harvest feed**. 🟦

### ⛓️ Solana / on-chain (see ROADMAP M1–M4)
- **Mint `$SPROUT`** as the real in-game SPL token (on-chain balance = coins). 🏔️
- **On-chain marketplace** for crops/seeds/items. 🏔️
- **Land as NFTs** / **rare crops & mutations as mintable NFTs**.
  ⚠️ *needs custom art — the Sprout Lands license forbids NFT use.* 🏔️
- **On-chain achievements / SBTs** ("proof of harvest"). 🟦
- **Wallet-gated content** (holders get a cosmetic/seed/plot). 🟦
- **Stake `$SPROUT`** for in-game boosts or a yield plot. 🟦
- **VRF** for provably-fair rare drops. 🟦

### 🪙 `$SPROUT` token utility & tokenomics
- **Sinks**: premium seeds, land expansion, cosmetic mints, marketplace fees,
  prestige, burn-to-reroll. **Faucets**: rare harvests, events, achievements.
  Keep faucet/sink balanced. 🏔️
- **Seasonal reward pools** for top farmers; **community treasury** from a
  small harvest tax. 🟦
- **Cosmetic-first airdrop** for early players. 🟦

### 🎨 Cosmetics, pets & companions
- **Character customization** (skins/outfits/hats). 🟦
- **The cat mascot as a companion pet** with passive buffs. 🟦
- **Companion/pet collection** that nudges luck/growth (cozy, *not* gacha). 🟦
- **Crop/plot skins**, golden tools, seasonal themes; **badge flair**. 🍓
- **Emotes & stickers** (reuse as Discord/Twitter assets). 🍓

### 🎮 Mini-games
- Fishing, cooking, animal-care, festival games (ring toss, cart racing). 🟦
- A **cozy "seed gacha"** with shown odds; **irrigation puzzle**; a light
  **"defend the harvest"** night event. 🟦

### 🧭 UX, onboarding & accessibility
- **Interactive tutorial / guided starter quests**; **a goals/next-step HUD**. 🟦
- **Tooltips with live numbers** (value, grow time, odds). 🍓
- **Keybind remap, colourblind modes, text scaling, reduced-motion**. 🟦
- **Controller & touch support**; **i18n/localization**. 🏔️
- **Cloud saves + account system** (today it's localStorage — loss risk). 🟦

### 🔊 Audio & game feel (juice)
- **Music** (day/night + seasonal tracks; reactive intensity). 🟦
- **More particle juice** (harvest combos, rare-pull screen-shake, level-up
  confetti); **satisfying sell-all coin counter**; **mobile haptics**. 🍓

### ⚙️ Tech, performance & platform
- **Cloud saves + anti-cheat** (required before any on-chain economy). 🟦
- **Mobile/PWA build**; **desktop wrapper**. 🟦
- **Analytics + replay** to balance with real data; **economy-sim tests**
  (catch trivialization like Fertilizer+Sprinkler); **a tunable balance
  config** (no code deploy to retune). 🟦
- **Server-authoritative state** for multiplayer/on-chain trust. 🏔️

### 📣 Marketing, community & growth
- **In-game "share my farm" → auto Twitter card** (builds on the branding art). 🟦
- **Referral/invite rewards**; **role-gated Discord**. 🍓
- **Landing site + public devlog/roadmap**; **creator/streamer kit**. 🟦
- **Rare-harvest auto-tweets** ("@player grew a Celestial Voidbloom 🌌"). 🟦
- **Community contests** (best-decorated farm) with `$SPROUT` prizes. 🟦

---

## 🚧 Guardrails

- **Art license:** the Sprout Lands assets forbid **NFT use** (see
  [`../CREDITS.md`](../CREDITS.md)). Any land/item/crop **NFT** feature needs
  custom art or separate licensing. A fungible `$SPROUT` token is fine.
- **Stay cozy, not predatory:** keep the *delight* of mutations/pets/collection,
  but avoid Grow-a-Garden-style dark patterns — **no gacha-for-cash,
  pay-to-skip timers, or manufactured FOMO.** Especially important for a
  token-branded game's reputation.
- **Don't trust the client:** anything that mints value must be verifiable
  on-chain/oracle before mainnet (see ROADMAP "Cross-cutting tech notes").

## 📚 Inspiration

Stardew Valley (skills/professions, quality, Perfection, festivals), Grow a
Garden (rarity × mutation stacking, pets), Sunflower Land (skill trees, land
expansion), Cookie Clicker (collection-as-power "milk", prestige math), Animal
Crossing (Nook Miles, no-pressure loans), Cozy Grove / Story of Seasons /
Harvest Moon (cozy pacing, tool trade-offs).
