# 🌱 Launch-Night Content Drop Queue — 10 Packed Drops

Ten big, themed updates to release **one per hour**. Each drop is a **checkpoint**
bundling a batch of additive commits — releasing one is a single fast-forward of
your deploy branch to that drop's SHA, in order (1 → 10). Everything **typechecks
clean** (`npm run typecheck`) and is additive: no save migrations, no chain code.

## What this queue delivers
**196 plants · 15 mutations · 62 fish · 22 forageables · 34 achievements · 50-rung
quest ladder (with Divine+ seed milestones) · 280 item descriptions · 14 rotating
festivals · Shop/Seeds filters · a Lv18 perk tier for all 5 skills.** Crops & mutations are art-free (existing
sprite rows recolored via `cropTint`); no item was added without a real sprite.

---

## How to release one drop (per hour)

> Confirm which branch your host builds (Vercel = primary per `vercel.json`).
> Replace `<deploy-branch>`. Release the SHAs **in order**, one per hour.

```bash
git push origin <SHA>:<deploy-branch>   # each push = one deploy = one drop
```

---

## The 10 drops

| Hr | Drop | Deploy SHA | What lands |
|----|------|-----------|-----------|
| 1 | **Launch Core** | `1f926fd` | 7 crops · 2 mutations (Aurora, Celestial) · 4 fish · 2 forage · 4 achievements |
| 2 | **Orchard & Veggie Patch** | `78d77bd` | 42 crops: fruits, roots, greens, herbs, grains |
| 3 | **Summer & Tropics** | `6bb9099` | 35 crops: berries, melons, peppers, tropical, flowers |
| 4 | **Mythic & Cosmic** | `9bd5ee8` | 21 crops: mandrake, gemfruit, meteor melon, solar lotus… |
| 5 | **Seas & Wilds** | `9b6be6c` | 18 fish + 8 forageables |
| 6 | **Mutations & Mastery** | `f4bbc16` | 4 mutations · 8 achievements · **Lv18 perks ×5 skills** · balance tune |
| 7 | **Grove & Frontiers** | `d171882` | 48 crops: citrus, nuts, heirloom veg, autumn, vines, cacti |
| 8 | **Elements, Deep & Sweets** | `307e169` | 24 crops (aquatic, candy, volcanic) + 20 fish + 6 forage + 4 mutations (incl. **Abyssal 150×**) + 12 achievements |
| 9 | **The Compendium** | `833069f` | **280 item flavor descriptions** (plant tooltips + Almanac Fish Bestiary & Forage Field Guide) + **rarity/search filters** on Shop & Seeds |
| 10 | **Quests & Festivals** | `ccb518d` | **Questline 18 → 50 goals** + **goal-set milestones** (every 10 goals cleared → a guaranteed Divine+ seed, up to Celestial) + **14 rotating seasonal festivals** (daily banner) |

> Each SHA bundles several commits — that's what makes them "packed." Releasing in
> order applies cleanly. Drops 1–6 are the collectible waves; 7–8 are the big
> expansion; 9–10 are the depth layer (lore, filters, quests, events).

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

- Wire festival *effects* (events.ts exposes `eventForDay` / the active id — e.g. a
  double-value or triple-mutation day) instead of flavor-only banners.
- In-game **"What's New" toast** on load so each hourly drop announces itself.
- A third collectible wave is **not** recommended — fish/forage frames are
  exhausted and 196 crops already fills the catalog; depth (above) is the better lever.
