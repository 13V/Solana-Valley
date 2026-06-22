# Credits

## Art — Sprout Lands (Cup Nooble)

> **Some or all of the art assets in this project are made by Cup Nooble**
> (the *Sprout Lands* asset packs), used under the Sprout Lands license.

- Base art (ground, water, character, trees, house, decorations):
  https://cupnooble.itch.io/sprout-lands-asset-pack
- UI (panel frames, nameplate banners, buttons, chips, slots, sliders, toggles,
  check/cross marks, close button, coins/stars icons) **and the Sprout Lands
  pixel font**: **Sprout Lands UI Pack — Premium** —
  https://cupnooble.itch.io/sprout-lands-ui-pack
- Crops, produce/seed item icons (and additional content):
  **Sprout Lands Sprites — Premium pack** — https://cupnooble.itch.io/sprout-lands-asset-pack
- Fishing — player rod-cast animations, bobber + water-splash, and fish/shadow
  sprites: **Sprout Lands "Sorry Pack" — Ocean Pack** (Cup Nooble). Files:
  `fishing_{front,back,side}.png`, `fishing_splash.png`, `fish_shadow_md.png`, `fish.png`.
  Commercial use confirmed permitted by Cup Nooble (no redistribution of the pack itself; no NFTs).

These assets are included in this repository under the terms below. They live in
`app/public/assets/sprout/` (base) and `app/public/assets/sprout-ui/` (premium UI).

### License terms (per Cup Nooble's `read_me.txt`)

- ✅ Usable in **commercial and non-commercial** projects.
- ✅ Assets may be **modified**.
- ✅ **Open-source projects may include** the assets, provided this credit note +
  the licensing terms are included (this file).
- ❌ You may **not redistribute or resell the asset pack itself** (even modified)
  as an asset pack on other platforms.
- ❌ **Not allowed for anything to do with NFTs or AI training.**
- Credit is required: *Assets — From: Sprout Lands — By: Cup Nooble.*

For different terms, Cup Nooble invites contact (Discord: `cup_nooble`).

## Map Editor — Sprout Lands tiles

The browser-based map editor in `map-editor/` is built around **"Sprout Lands"**
tiles by **Cup Nooble** (<https://cupnooble.itch.io/>). It uses two packs:

- **Sprout Lands — Sprites (Premium pack)**
- **Sprout Lands "Sorry" (basic) pack**

Required credit line (as given by the artist):

> Assets — From: Sprout Lands — By: Cup Nooble

The editor **bundles these tiles for use within the tool itself** — it is **not**
a redistributable copy of the Sprout Lands asset pack. The tiles remain the work
of Cup Nooble and are credited here as such.

### License terms (per the packs' `read_me.txt`)

- ✅ **Premium pack:** usable in **both non-commercial and commercial** projects.
- ✅ **Basic / "Sorry" pack:** **non-commercial** projects only.
- ✅ **Open-source projects may include** the assets, provided this credit note +
  the licensing terms are included.
- ✅ You **may** redistribute your own projects (games/software) made with the
  assets.
- ❌ You may **not redistribute or resell the asset pack itself** (even modified).
- ❌ **Not allowed for anything to do with NFTs or AI training.**

> ⚠️ **Commercial-use note:** because the basic ("Sorry") pack is
> **non-commercial only**, commercial use of maps made with this editor is
> limited by that restriction — commercial projects must use only the Premium
> pack's tiles.

> ⚠️ **Project note:** Solana Valley is a blockchain game. The current build uses
> wallet connect + off-chain coins (no NFTs), which is fine. However, the license
> forbids use **"for anything to do with NFTs."** Any future feature that turns
> land or items into **NFTs** (see `docs/ROADMAP.md` M2/M3) would **not** be
> permitted with these assets — you'd need custom licensing from Cup Nooble or
> separate art for those features. A fungible SPL token ($VALLEY) is not an NFT,
> but treat the NFT roadmap items as blocked on this until licensing is sorted.

## Fonts

- **Sprout Lands pixel font** (Cup Nooble) — used as the *display* face for
  titles, buttons and labels. Ships with the **Sprout Lands UI Pack — Premium**
  and is covered by that pack's license (see the Art section above). Files:
  `app/public/assets/fonts/sprout-lands.ttf`, `sprout-lands-sm.ttf`.
- **Pixelify Sans** — SIL Open Font License (OFL).
  Source: https://fonts.google.com/specimen/Pixelify+Sans
- A pixel **Minecraft**-style face is used for dense body copy
  (`app/public/assets/fonts/minecraft.ttf`).

## Original work

Crop sprites and all visual effects (particles, glow, vignette, day/night tint)
and sound effects are generated procedurally in code and are original to this
project.
