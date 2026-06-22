# 🌱 Launch-Night Content Drop Queue

A pre-built backlog of bite-sized content updates to release **one per hour**
during launch to keep the hype train rolling. Every drop is its own commit on
`claude/loving-goodall-z529k7`, **typechecks clean** (`npm run typecheck`), and
is purely additive — no save migrations, no balance resets, no chain/token code.

The drops are stacked in release order, so releasing in sequence (1 → 8) always
applies cleanly.

---

## How to release one drop (per hour)

Each drop is a single commit. Releasing = advancing whatever branch your host
deploys from to that drop's commit, **in order**.

> Confirm which branch your host builds (Vercel = primary per `vercel.json`;
> GitHub Pages workflow is a manual fallback). Replace `<deploy-branch>` below.

**Option A — fast-forward the deploy branch to the next drop (simplest):**
```bash
# Hour 1:
git push origin 5d2333b:<deploy-branch>   # drop 1
# Hour 2:
git push origin f164a5d:<deploy-branch>   # drop 2
# ...advance to the next SHA each hour (see table). Each push = one deploy.
```

**Option B — cherry-pick onto the deploy branch (if it diverges):**
```bash
git checkout <deploy-branch>
git cherry-pick 5d2333b   # then f164a5d, 6d7c676, ... in order, one per hour
git push origin <deploy-branch>
```

After each release, post the matching announcement copy (below) wherever your
community lives. The game already shows a `toast` for in-game nudges — see
"Amplify the drops" at the bottom for a one-time in-game "what's new" hook.

---

## The lineup

| Hr | SHA | Drop | What players get | Files |
|----|-----|------|------------------|-------|
| 1 | `5d2333b` | **Aurora mutation** | New 6× harvest mutation (rarer than Frosted) | `economy.ts` |
| 2 | `f164a5d` | **Starter crops** | Potato, Radish, Strawberry (regrows) | `economy.ts`, `progression.ts` |
| 3 | `6d7c676` | **New achievements** | Valley Veteran, Harvest King, Mutation Hoarder, Millionaire | `progression.ts` |
| 4 | `c7a6179` | **Celestial mutation** | The new rarest mutation — 50× value | `economy.ts` |
| 5 | `e15b0f5` | **Mid-game crops** | Watermelon (regrows), Dragonfruit | `economy.ts` |
| 6 | `b6a0dc9` | **New fish ×4** | Spotted Koi, Mahi-Mahi, Moonfish, Coelacanth | `fishing.ts` |
| 7 | `79ef6bb` | **New forage ×2** | Snowdrop, Amber Geode | `forage.ts` |
| 8 | `1f926fd` | **Endgame crops** | Sunpetal (Divine), Nebula Bloom (Prismatic) | `economy.ts` |

After all 8: **2 new mutations (5→7)**, **7 new crops (19→26)**, **2 new forage
(6→8)**, **4 new fish (20→24)**, **4 new achievements (10→14)**. Every one
auto-flows into the shop, seed picker, Almanac, collection bonus, and Master
Gardener % completion.

---

## Ready-to-paste announcement copy

1. **🌈 NEW MUTATION: Aurora!** A shimmering aquamarine mutation now blooms on harvests — 6× value. Rarer than Frosted. Can you pull one tonight?
2. **🌱 FRESH SEEDS in the shop!** Potato, Radish & Strawberry just hit the Valley — Strawberry regrows, so plant once and keep harvesting. 🍓
3. **🏆 NEW ACHIEVEMENTS!** Chase Valley Veteran, Harvest King, Mutation Hoarder & the big one — Valley Millionaire. How many can you bag?
4. **✨ THE RAREST MUTATION YET: Celestial — 50×!** A one-in-a-thousand glow. Stack the Fortune Jackpot upgrade to tilt the odds. Screenshot it when you get it. 👀
5. **🍉 RARE CROPS DROP:** Watermelon (regrows!) & Dragonfruit are now growing in the Valley. Mid-game money just got juicier.
6. **🎣 THE FISH ARE BITING!** Four new catches: Spotted Koi, Mahi-Mahi, Moonfish & the legendary living-fossil Coelacanth. Grab a rod.
7. **🍄 NEW WILD FINDS:** Snowdrop flowers and Amber Geodes are appearing out in the world. Go foraging.
8. **🌌 ENDGAME CROPS:** Sunpetal (Divine) & Nebula Bloom (Prismatic) — the new top-shelf chase. Masters only. 💎

---

## Pre-release checks (per drop)

- All drops already pass `npm run typecheck`. Re-run it on the deploy branch
  after a cherry-pick to be safe.
- **Drops 6 & 7 (fish/forage):** sprite frames are picked from each sheet's
  unused pool. Worth a 30-second look in `npm run preview` (fish: cast at the
  pond/sea; forage: wander the grass). If any sprite looks wrong, change only
  the `frame:` number — it's cosmetic and cannot break the build.

## Amplify the drops (optional, ~20 min, not yet built)

The biggest hype multiplier isn't more items — it's making players *notice* them.
The `EventBus` already has a `toast` channel and React renders it
(`app/src/ui/Toasts.tsx`). A tiny "What's New" banner or a one-line
`bus.emit('toast', '🌈 New: Aurora mutation!')` fired on load would surface each
drop in-game. Say the word and I'll add it as drop 0 / a standing feature.

## More queued ideas (fast follow-ups, not yet built)

- More mutations (each is ~2 lines, pure tint).
- A new skill perk tier at Lv18 (touches `skills.ts` + `PERK_LEVELS` + the
  Skills panel — medium effort).
- New animal (needs spritesheets — art-dependent, larger).
- Daily-quest panel / limited-time "festival" double-value hour (UI + FarmScene).
