# Credits

## Art — Sprout Lands (Cup Nooble)

The game's pixel-art visuals (ground, water, character, trees, house, and other
decorations) come from the **free Sprout Lands asset pack** by **Cup Nooble**:

- https://cupnooble.itch.io/sprout-lands-asset-pack

**These assets are NOT committed to this repository.** Cup Nooble's free license
permits using the pack in games but restricts redistributing the pack itself, so
the art is downloaded on demand by [`scripts/fetch-assets.mjs`](scripts/fetch-assets.mjs)
into `app/public/assets/sprout/` (which is git-ignored). The script currently
pulls from a public GitHub mirror
([`perquis/sprout_lands`](https://github.com/perquis/sprout_lands)) for
convenience.

If you plan to distribute or sell this game, please review Cup Nooble's license
and obtain the assets from the official itch.io page above. Consider supporting
the artist by buying the premium pack.

## UI — Sprout Lands UI Pack (Premium, Cup Nooble)

The interface (panel frames, buttons, chips, hotbar slots) is skinned with the
**Sprout Lands UI Pack — Premium** by **Cup Nooble**, used under a purchased
license:

- https://cupnooble.itch.io/sprout-lands-ui-pack

Like the base art, these files are **not committed** to the repo (the license
restricts redistribution). They live in the git-ignored
`app/public/assets/sprout-ui/` directory. The UI skin only activates if those
assets are present (see the `ui-skin` probe in `app/src/ui/App.tsx`); otherwise
the game falls back to the built-in CSS theme. Each developer must supply their
own licensed copy of the pack.

Crop sprites and all visual effects (particles, glow, vignette, day/night
tint) are generated procedurally in code and are original to this project.
