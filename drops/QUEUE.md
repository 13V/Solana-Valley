# 🌱 Launch-Night Content Drop Queue — 13 Packed Drops

Thirteen big, themed updates to release **one per hour**. Each drop is a **checkpoint**
bundling a batch of additive commits — releasing one is a single fast-forward of
your deploy branch to that drop's SHA, in order (1 → 13). Everything **typechecks
clean** (`npm run typecheck`) and is additive: no save migrations, no chain code.

> **New:** every drop now carries a one-tap **auto-update pill** — once a player is
> on any drop, the *next* drop you ship surfaces a "🌱 New update — tap to refresh"
> button in their open tab (no manual reload). See **Auto-update** below.

## What this queue delivers
**196 plants · 15 mutations · 62 fish · 22 forageables · 34 achievements · 50-rung
quest ladder (with Divine+ seed milestones) · 280 item descriptions · 14 rotating
festivals (with live gameplay buffs) · Shop/Seeds filters · plant-family set bonuses · daily quests + streaks · a Lv18 perk tier for all
5 skills.** Crops & mutations are art-free (existing sprite rows recolored via
`cropTint`); no item was added without a real sprite.

---

## How to release one drop (per hour)

> Confirm which branch your host builds (Vercel = primary per `vercel.json`).
> Replace `<deploy-branch>`. Release the SHAs **in order**, one per hour.

```bash
git push origin <SHA>:<deploy-branch>   # each push = one deploy = one drop
```

---

## The 13 drops

| Hr | Drop | Deploy SHA | What lands |
|----|------|-----------|-----------|
| 1 | **Launch Core** | `bf5717b` | 7 crops · 2 mutations (Aurora, Celestial) · 4 fish · 2 forage · 4 achievements · **auto-update pill** |
| 2 | **Orchard & Veggie Patch** | `42e3e03` | 42 crops: fruits, roots, greens, herbs, grains |
| 3 | **Summer & Tropics** | `58a4468` | 35 crops: berries, melons, peppers, tropical, flowers |
| 4 | **Mythic & Cosmic** | `da7696d` | 21 crops: mandrake, gemfruit, meteor melon, solar lotus… |
| 5 | **Seas & Wilds** | `b65549d` | 18 fish + 8 forageables |
| 6 | **Mutations & Mastery** | `c144017` | 4 mutations · 8 achievements · **Lv18 perks ×5 skills** · balance tune |
| 7 | **Grove & Frontiers** | `0171c38` | 48 crops: citrus, nuts, heirloom veg, autumn, vines, cacti |
| 8 | **Elements, Deep & Sweets** | `72b39a9` | 24 crops (aquatic, candy, volcanic) + 20 fish + 6 forage + 4 mutations (incl. **Abyssal 150×**) + 12 achievements |
| 9 | **The Compendium** | `1842a7d` | **280 item flavor descriptions** (plant tooltips + Almanac Fish Bestiary & Forage Field Guide) + **rarity/search filters** on Shop & Seeds |
| 10 | **Quests & Festivals** | `70d589d` | **Questline 18 → 50 goals** + **goal-set milestones** (every 10 goals cleared → a guaranteed Divine+ seed, up to Celestial) + **14 rotating seasonal festivals** (daily banner) |
| 11 | **Collection Power** | `a197e12` | **Plant-family set bonuses** — discover every plant in a family (23 families) and that family's crops permanently sell **+12%**. New Almanac "Plant Families" grid + a "🌾 family complete!" toast. Makes the 196-plant Almanac economically load-bearing. |
| 12 | **Living Festivals** | `49e675c` | The 14 rotating festivals now **buff gameplay** during their day — ×3 mutation odds (Mutation Moon), +20–50% crop sale value, +20–40% growth, ×2 fishing/foraging luck. The banner shows the active buff; recurs on the calendar so nothing's missable. |
| 13 | **Daily Quests & Welcome-Back** | `d4dbf79` | **3 rotating daily quests + a 🔥 streak** (one-day grace so a single miss won't wipe it; every 7-day streak drops a Divine seed), shown atop the Goals HUD. Plus a one-time **"What's New"** notice so returning players see each update. |

> Each SHA bundles several commits — that's what makes them "packed." Releasing in
> order applies cleanly. Drops 1–6 are the collectible waves; 7–8 are the big
> expansion; 9–13 are the depth/retention layer (lore, filters, quests, events, collection power, festival buffs, dailies).

---

## Auto-update — players don't have to refresh

Every drop carries a one-tap update pill (it sits at the base of the stack, so
it's in **drop 1 onward**). How it behaves on Vercel:

- Each build stamps a unique id into the bundle **and** ships a matching
  `/version.json`. An open tab quietly polls that file (every ~3 min and whenever
  the tab regains focus) — no service worker, no websockets.
- When you deploy the next hourly drop, the served `version.json` changes, the
  open tab notices the mismatch, and the player sees a **"🌱 New update — tap to
  refresh"** pill. One tap reloads into the new drop — instant and **lossless**
  (the farm autosaves to localStorage + cloud).
- New visitors always get the latest build automatically (normal Vercel behavior).
  The pill only matters for tabs that were *already open* when you shipped.

So the auto-surface kicks in from the **second** drop you deploy: a player has to
be running a pill-bearing build (any drop here) to be notified of the next one.
That's why the pill is foundational — it ships inside drop 1.

> Want truly *no-redeploy* updates (change content without shipping a build at
> all)? That means moving the content tables (economy/fish/forage) into Supabase
> and loading them at runtime — a real architecture change, flagged for later.

---

## Ready-to-paste announcements

1. **🌱 SOLANA VALLEY IS LIVE!** Two mutations (Aurora 6× & legendary Celestial 50×), fresh crops, fish & achievements. Go plant something. 🌾
2. **🍎 ORCHARD & VEGGIE PATCH — 42 NEW CROPS!** Fruits, roots, leafy greens, herbs & grains.
3. **🫐 SUMMER & TROPICS — 35 NEW CROPS!** Berries (they regrow!), melons, peppers, mango, orchids. 🌶️🥭
4. **🌌 MYTHIC & COSMIC — 21 NEW CROPS!** Mandrake, gemfruit, meteor melon, solar lotus. The chase tier is here.
5. **🎣 SEAS & WILDS!** 18 new fish from the depths + 8 new forageables. Grab a rod.
6. **🧬 MUTATIONS & MASTERY!** 4 new mutations, 8 achievements, and a new **Lv18 perk** for every skill.
7. **🍋 GROVE & FRONTIERS — 48 NEW CROPS!** Citrus, nuts, heirloom veg, autumn harvest, vine fruits & desert cacti.
8. **🍬 ELEMENTS, DEEP & SWEETS!** Aquatic blooms, a candy garden, a volcanic chase line, 20 more fish, and the rarest mutation ever — **Abyssal 150×.** 💎
9. **📖 THE COMPENDIUM!** Every one of the 280 crops, fish & forageables now has its own flavor description — explore the new Fish Bestiary & Field Guide. Plus rarity & search filters so the shop's a breeze. 
10. **🎯 QUESTS & FESTIVALS!** A 50-rung quest ladder — and every 10 goals you clear now drops a guaranteed **Divine-or-better seed** (clear them all for a Celestial!). Plus 14 rotating seasonal festivals. The grand finale! 🎉
11. **🌾 COLLECTION POWER!** Finishing a plant family now permanently boosts that family's crop prices by **+12%** — 23 families to complete, from Root Veg to Cosmic Harvest. Your Almanac just became your money-maker. Gotta grow 'em all! 📖
12. **🎉 LIVING FESTIVALS!** Every festival now actually *does* something — Mutation Moon triples mutation odds, Frost Fair pays +50% for crops, Fisher's Frenzy doubles rare catches, Spring Bloom speeds growth & more. Check the banner and plan your day around it!
13. **📅 DAILY QUESTS & STREAKS!** Three fresh quests every day — finish them to build a 🔥 streak (miss a day? a grace day's got you). Hit a 7-day streak for a free Divine seed. Come back daily — your valley misses you!

---

## Pre-release checks

- All drops pass `npm run typecheck`. Re-run on the deploy branch after a cherry-pick.
- **Sprite-frame caveat (fish & forage in drops 1, 5, 8):** frames come from each
  sheet's unused pool — worth a `npm run preview` glance; any odd one is a
  one-number `frame:` swap (cosmetic, can't break the build). Crops & mutations
  are art-safe.
- **New UI to eyeball in preview:** the Almanac (Fish Bestiary / Field Guide), the
  Shop/Seeds filter bar, the Goals HUD (now shows the next 6 rungs + "more"), and
  the top-center festival banner. All typecheck-clean; a quick visual pass is nice
  to confirm placement on your target screen size.

## Still in the tank (optional follow-ups)

- ✅ **Festival effects** — shipped in Drop 12 (events.ts buffs are live).
- ✅ **"What's New" notice** on load — shipped in Drop 13.
- ✅ **One-tap auto-update pill** — shipped (baked into every drop; see Auto-update).
- A third collectible wave is **not** recommended — fish/forage frames are
  exhausted and 196 crops already fills the catalog; depth (above) is the better lever.
- Runtime content from Supabase (no-redeploy updates) — bigger lift, flagged above.
