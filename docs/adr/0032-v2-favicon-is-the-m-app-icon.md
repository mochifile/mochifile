# 0032. The favicon is the "m" app icon of the V2 Home

- **Status:** Proposed in the draft PR #81 (`feat/v2-mascot-assets-refresh`); Accepted on merge
- **Date:** 2026-10-28
- **Amends:** [0024](0024-lettered-wordmark.md) and the design system's *Logo* section, which name the
  mochi-document with eyes as the favicon and the app icons

## Context

The favicon, the touch icon and the manifest icon were the v1 symbol, a mochi-document with two
eyes (`docs/design-system/assets/Logos`), the app icon on a mango square. The V2 canvas draws a
different mark: a dark lowercase **"m" with a red and a green dot** on cream, shown as the
"One engine" core of the Home's second section ("Works where you work") and as "App icon" and
"Favicons" on the brand sheet (`MFBrand`). The maintainer confirmed on 2026-10-28 that this "m" is
the official favicon.

The artboard says to use only the supplied PNG files and never redraw, retype or recolour. The only
source of the "m" is a raster: 316 x 300 px in `docs/design-ref/v2/assets/sheet-app-icon.png`
(SHA-256 `1d39671f2a8c44a01ae69e122a7e9a0095bb811a8499a3af0d664f6a8d96129b`; the Home ships a 208 px copy, `assets/home/sheet-app-icon-208.webp`).

## Decision

- **The favicon and the app icons are the "m" app icon.** The mark is not redrawn, so there is
  **no SVG favicon** (`favicon.svg` is removed): an SVG would be a new drawing of it.
- **Derived by cropping and resampling only** (sharp, Lanczos3, no sharpening, opaque cream kept):
  - `favicon-16.png`, `favicon-32.png`, `favicon-48.png`: a 250 px square centred on the ink
    (x 32-282, y 19-269 of the file): 13-14 px of cream at the sides and about 31 px above and
    below the mark, so the glyph is as large as the original composition allows in a tab.
  - `apple-touch-icon.png` (180 px) and `icon-512.png` (512 px, the manifest icon): a 264 px
    square (x 26-290, y 12-276) of plain cream inside the tile, so the tile's own rounded edge and
    the beige strip under it stay out; the mark is centred, as drawn. iOS rounds the corners
    itself. The 512 px file is enlarged 1.9x from that crop, so it is soft; a larger original
    would replace it.
- **Links** are in `BaseLayout.astro` (the 48, 32 and 16 px icons, the touch icon, the manifest);
  every page, in both languages and the 404, uses that layout.
- **Not changed:** the lettered wordmark, the v1 files in `docs/design-system/assets/Logos` (the
  document-with-eyes symbol stays the mascot's face and the avatar), and the Home hub's image.

## Consequences

- The mark is legible at 32 and 48 px. At **16 px the two dots are about 2 px wide** and blur
  into the glyph's edge; the "m" itself still reads. This is a limit of the artwork at that size,
  and no other identity was invented to fix it. Comparison:
  `docs/integration/images/favicon-before-after.webp`.
- Browsers that ask for `/favicon.ico` without reading the `<link>`s get the 404 page, as before.
- The favicon and the two app icons now come from a 316 px raster. A vector or a 1024 px master of
  the "m" from the designer would allow a sharper 512 px icon and an SVG favicon.
- The design system's *Logo* section is updated to say so; the v1 files stay for history.
