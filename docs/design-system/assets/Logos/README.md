# Logos
Final logo v1, drawn as vectors (no font). Horizontal and stacked lockups, light and on-dark versions, the wordmark, the symbol and the pixel-drawn 16px favicon. Usage rules are in the brand book, section *Logo*.

## The lettered wordmark (ADR 0024)
The header, the footer and the READMEs use the approved lowercase lettering, as two raster files:

| File | Shown on | Lettering | Size |
| --- | --- | --- | --- |
| `mochifile-wordmark-light.png` | the **light** colour scheme: page and card grounds | Ink | 960 × 171 px |
| `mochifile-wordmark-dark.png` | the **dark** colour scheme: dark grounds and the ink footer | Cream | 960 × 173 px |

**Naming:** `light` and `dark` name the colour scheme the file is *displayed in*, not the colour of the letters. The `-light` file has dark letters. The i-dots (coral and green) are the same in both.

- Both are 8-bit RGBA PNG on a transparent ground, trimmed to the lettering, with no padding. The clear space is the layout's job: the height of the "o", 0.715 of the wordmark's height.
- They are the approved artwork, not redrawn. Only the matting residue around the letters was removed (alpha of 5/255 or less, 3 px beyond the letters), then the files were trimmed and resized with Lanczos to 960 px wide. The two files have slightly different proportions (5.61 and 5.55) because they are two renderings of one drawing.
- The artwork is raster. Do not trace it to SVG: if a vector master is delivered, replace these files under the same names.
- The site ships smaller palette copies in `apps/web/src/assets/logo/` (368 and 552 px wide, 256 colours, no dithering: at most 8/255 off the master on any edge pixel). To regenerate them: `sharp(master).resize({ width }).png({ palette: true, colours: 256, quality: 100, dither: 0, effort: 10, compressionLevel: 9 })`. A test keeps them in step with the masters.

The v1 vector files in this folder stay: the symbol, the favicons, the app icons and the drawn lockups are unchanged. The v1 horizontal and stacked lockups and the v1 drawn wordmark are no longer used by the site.
