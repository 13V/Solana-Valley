# 🌱 Sprout Valley — brand art

Social art for **Sprout Valley** (`$SPROUT`), generated procedurally from code
in the game's cozy palette. All art here is **original** — it does not use the
licensed Sprout Lands sprites, which forbid crypto/NFT use (see
[`../CREDITS.md`](../CREDITS.md)).

| File | Size | Use |
| --- | --- | --- |
| `sprout-valley-pfp.png` | 512×512 | Twitter/X avatar — farmer (reads in a circle) |
| `sprout-valley-coin.png` | 512×512 | Alt avatar / logomark — `$SPROUT` sprout coin |
| `sprout-valley-banner.png` | 1500×500 | Twitter/X header (exact spec) |

## Regenerate / tweak

```bash
pip install Pillow
python3 scripts/branding.py    # rewrites the PNGs above
```

Colors, text, and layout live in [`../scripts/branding.py`](../scripts/branding.py).

> Tip: X crops the header differently on mobile vs desktop and the avatar circle
> overlaps the lower-left of the banner — the wordmark is kept centered/high so it
> survives the crop.
