# 🌱 Launch-Night Content Drop Queue

A pre-built backlog of bite-sized content updates to release **one per hour**
during launch to keep the hype train rolling. Every drop is its own commit on
`claude/loving-goodall-z529k7`, **typechecks clean** (`npm run typecheck`), and
is purely additive — no save migrations, no balance resets, no chain/token code.

The drops are stacked in release order, so releasing in sequence (1 → 19) always
applies cleanly.

**What this queue adds in total:** 19 → **124 plants**, 5 → **11 mutations**,
20 → **42 fish**, 6 → **16 forageables**, 10 → **22 achievements**, plus a new
**Lv18 perk tier** for all five skills. Everything auto-flows into the shop, seed
picker, Almanac, collection bonus, and Master Gardener % completion.

---

## How to release one drop (per hour)

Each drop is a single commit. Releasing = advancing whatever branch your host
deploys from to that drop's commit, **in order**.

> Confirm which branch your host builds (Vercel = primary per `vercel.json`;
> GitHub Pages workflow is a manual fallback). Replace `<deploy-branch>` below.

**Option A — fast-forward the deploy branch to the next drop (simplest):**
```bash
git push origin <SHA>:<deploy-branch>   # one SHA per hour, in order (see table). Each push = one deploy.
```

**Option B — cherry-pick onto the deploy branch (if it diverges):**
```bash
git checkout <deploy-branch>
git cherry-pick <SHA>   # in order, one per hour
git push origin <deploy-branch>
```

After each release, post the matching announcement copy (below).

---

## The lineup

| Hr | SHA | Drop | What players get |
|----|-----|------|------------------|
| 1 | `5d2333b` | **Aurora mutation** | New 6× harvest mutation |
| 2 | `f164a5d` | **Starter crops** | Potato, Radish, Strawberry |
| 3 | `6d7c676` | **Achievements ×4** | Veteran, Harvest King, Mutation Hoarder, Millionaire |
| 4 | `c7a6179` | **Celestial mutation** | The 50× rarest mutation |
| 5 | `e15b0f5` | **Mid-game crops** | Watermelon, Dragonfruit |
| 6 | `b6a0dc9` | **Fish ×4** | Koi, Mahi-Mahi, Moonfish, Coelacanth |
| 7 | `79ef6bb` | **Forage ×2** | Snowdrop, Amber Geode |
| 8 | `1f926fd` | **Endgame crops** | Sunpetal, Nebula Bloom |
| 9 | `4fa79ab` | **Orchard & Stone Fruits** | 14 crops: apples, pears, peaches, cherries… |
| 10 | `78d77bd` | **Veggie Patch & Herb Garden** | 28 crops: roots, greens, herbs, grains |
| 11 | `b63411c` | **Summer Garden** | 21 crops: berries, melons, peppers |
| 12 | `6bb9099` | **Tropical & Bloom** | 14 crops: mango, papaya, orchid, lotus… |
| 13 | `9bd5ee8` | **Mythic & Cosmic** | 21 crops: mandrake, gemfruit, meteor melon… |
| 14 | `1ae4c1c` | **Big Catch Update** | 18 new fish across every rarity |
| 15 | `9b6be6c` | **Wild Bounty** | 8 new forageables |
| 16 | `332b57d` | **Mutation Pack** | Verdant, Molten, Glacial, Spectral |
| 17 | `a2cfded` | **Achievement Pack** | 8 new achievements |
| 18 | `8a5acbf` | **Lv18 Mastery Perks** | A 4th perk choice for all 5 skills |
| 19 | `f4bbc16` | **Collection rebalance** | Tunes the completion bonus for 124 plants |

> Order note: drops 9–13 are the crop packs; drop 19 retunes the collection
> bonus for the bigger roster, so keep it **after** the crop packs (the
> sequential order already does this). If you reorder, release 19 last.

---

## Ready-to-paste announcement copy

1. **🌈 NEW MUTATION: Aurora!** A shimmering 6× mutation now blooms on harvests. Can you pull one?
2. **🌱 FRESH SEEDS:** Potato, Radish & Strawberry hit the shop — Strawberry regrows! 🍓
3. **🏆 NEW ACHIEVEMENTS!** Valley Veteran, Harvest King, Mutation Hoarder & Valley Millionaire await.
4. **✨ THE RAREST YET: Celestial — 50×!** One-in-a-thousand. Stack Fortune Jackpot to chase it. 👀
5. **🍉 RARE CROPS:** Watermelon (regrows!) & Dragonfruit are growing now.
6. **🎣 THE FISH ARE BITING!** Koi, Mahi-Mahi, Moonfish & the living-fossil Coelacanth. Grab a rod.
7. **🍄 NEW WILD FINDS:** Snowdrops & Amber Geodes are out in the world. Go foraging.
8. **🌌 ENDGAME CROPS:** Sunpetal (Divine) & Nebula Bloom (Prismatic). Masters only. 💎
9. **🍎 ORCHARD UPDATE — 14 NEW FRUITS!** Apples, pears, peaches, cherries, figs & more now in rotation.
10. **🥬 VEGGIE PATCH — 28 NEW CROPS!** Roots, leafy greens, fresh herbs & golden grains. The farm just tripled.
11. **🫐 SUMMER GARDEN — 21 NEW CROPS!** Berries (they regrow!), melons & fiery peppers. 🌶️
12. **🥭 TROPICAL & BLOOM — 14 NEW CROPS!** Mango, papaya, orchids, lotuses — paradise comes to the Valley.
13. **🌌 MYTHIC & COSMIC — 21 NEW CROPS!** Mandrake, gemfruit, meteor melon, solar lotus. The chase tier is HERE. 124 crops total!
14. **🎣 BIG CATCH UPDATE — 18 NEW FISH!** From Sunfish to the mighty Sol Leviathan. Every rarity. Cast away!
15. **🍄 WILD BOUNTY — 8 NEW FORAGEABLES!** Mushrooms, flowers, stones & the rare Voidcrystal Shard.
16. **🧬 MUTATION PACK — 4 NEW MUTATIONS!** Verdant, Molten, Glacial & Spectral fill out the ladder. 11 total!
17. **🏆 ACHIEVEMENT PACK — 8 MORE!** New harvest, mutation, wealth & level milestones to conquer.
18. **🎯 MASTERY PERKS!** A brand-new Lv18 perk choice for every skill — Bumper Harvest, Master Angler & more.
19. *(balance — no announcement needed; ships the completion-bonus tune)*

---

## Pre-release checks

- All drops pass `npm run typecheck`. Re-run it on the deploy branch after a
  cherry-pick to be safe.
- **Sprite-frame caveat (drops 6, 7, 14, 15 — fish & forage):** frames come from
  each sheet's unused pool. Worth a quick look in `npm run preview` (cast at the
  pond/sea; wander the grass). If a sprite looks wrong, change only the `frame:`
  number — cosmetic, cannot break the build. Crops & mutations are art-safe (they
  recolor existing rows via `cropTint`).
- **Crops** were generated by a fleet of agents and lightly hand-checked
  (rarities, value bands, no duplicate ids, no black/white tints). They all
  typecheck and render via existing rows; spot-check a few in preview if you want
  pixel-perfect tints.

## Amplify the drops (optional, ~20 min, not yet built)

The biggest hype multiplier is making players *notice* each drop. `EventBus`
already has a `toast` channel rendered by `app/src/ui/Toasts.tsx`. A small
"What's New" banner or a `bus.emit('toast', '🌈 New: Aurora mutation!')` on load
would surface each drop in-game. Say the word and I'll add it.

## Still in the tank (fast follow-ups)

- More mutations (≈2 lines each, pure tint).
- New animals (needs spritesheets — art-dependent).
- Daily-quest panel / limited-time "festival" double-value hour (UI + FarmScene).
- A second wave of themed crop packs (the generator fleet can be re-run anytime).
