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

Crop sprites and all visual effects (particles, glow, vignette, day/night
tint) are generated procedurally in code and are original to this project.
