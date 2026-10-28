# Mascot illustrations (collection of 2026-10-28)

27 PNGs, delivered by the designer as the high-resolution replacement of the V2 mascot art:
8 sheets (`sheet-*`, a scene on a colour block), 13 expressions (`expr-*`, a face on a tinted
tile) and 6 category pictures (`use-*`). They replace the 276-1100 px WebP copies made from the
first export, which looked soft on Retina screens (issue #78).

Not a logo: the wordmark and the symbol are in [`Logos/`](Logos) and were not touched.

## Where the files are

| What | Path |
| --- | --- |
| Delivery files used by the site | `apps/web/src/assets/illustrations/<name>-<width>.webp` |
| Delivery files not used by any page yet (not built into the site) | `apps/web/src/assets/illustrations/library/` |
| The compressor panel's expressions (its own copy; a tool package cannot import from the app) | `packages/tools/compress-image/src/assets/expr-<name>-288.webp` |
| Helper that builds `src`, `srcset`, `width` and `height` | `apps/web/src/lib/illustrations.ts` |
| The 27 high-resolution originals | **not in git** (33 MB); see "Originals" |

To put a library picture on a page, move its files up one folder and call
`illustration('<name>', '<sizes>')`; nothing else needs registering.

## Delivery

- **Format:** WebP, lossy, quality 92 (96 for the 288 px expressions), `smartSubsample`, effort 6.
  Every file is opaque (the originals have no alpha), so no transparency is lost. Pages round
  the corners with CSS (`rounded-mascot` and friends); `sheet-lost` and `sheet-sleepy` carry a 9 px
  white corner in the original, which that radius clips (22 px at the sizes used).
- **Widths:** sheets and category pictures at 720 px (1x) and 1440 px (2x); expressions at 288 px,
  three times their largest box (96 px). The largest box on any page is 720 CSS px (About), so
  1440 px covers DPR 2 everywhere; the originals are 1.3-1.6 k px wide, so nothing is enlarged.
- **Resize:** Lanczos3 (sharp's default), once, from the original. No sharpening, filter, crop or
  colour change. WebP is supported by every browser the site targets, so there is no fallback
  format; the old files were WebP too.
- **Fidelity** (each delivered file decoded and compared with the original resized to the same
  width): PSNR 39.6-45.8 dB, mean absolute error at most 1.11 of 255 per channel. The worst
  pixels are on one-pixel edges between the dark outline and a colour. Crops enlarged 3x of the
  original, q90 and q95 were indistinguishable; lossless was 10-13x larger (650 KB at 1440 px),
  near-lossless the same, so lossy was kept.
- **Layout:** `width` and `height` come from the 720 px file, so the box is reserved by the
  picture's proportions. Across 62 pages and 7 viewports (320-1440 px) every image box has the
  same size as before the change, except the 404 mascot (see below).
- **Selection** (`sizes` measured on every page): at DPR 1 and 2 the browser always gets a file
  with at least the pixels the box needs; at DPR 3 the 720 px-wide About and guide pictures are
  limited by the 1440 px file (the source is 1630 px).

## Inventory

| File | Original | Delivered | Where |
| --- | --- | --- | --- |
| `expr-celebrate.png` | 1313x1198, 1.17 MB | 288 px 9.6 KB | web, compressor |
| `expr-confused.png` | 1313x1198, 1.17 MB | 288 px 9.9 KB | library (unused) |
| `expr-determined.png` | 1313x1198, 1.10 MB | 288 px 7.3 KB | web, compressor |
| `expr-excited.png` | 1313x1198, 1.16 MB | 288 px 8.2 KB | compressor |
| `expr-idea.png` | 1313x1198, 1.13 MB | 288 px 9.2 KB | web |
| `expr-normal.png` | 1313x1198, 1.14 MB | 288 px 6.7 KB | web, compressor |
| `expr-sad.png` | 1313x1198, 1.21 MB | 288 px 7.2 KB | web, compressor |
| `expr-sleeping.png` | 1313x1198, 1.21 MB | 288 px 8.4 KB | library (unused) |
| `expr-smiling.png` | 1313x1198, 1.11 MB | 288 px 7.0 KB | web, compressor |
| `expr-squishing.png` | 1313x1198, 1.16 MB | 288 px 8.5 KB | compressor |
| `expr-surprised.png` | 1313x1198, 1.15 MB | 288 px 7.1 KB | library (unused) |
| `expr-tired.png` | 1313x1198, 1.24 MB | 288 px 7.8 KB | library (unused) |
| `expr-wink.png` | 1313x1198, 1.05 MB | 288 px 6.9 KB | web |
| `sheet-done.png` | 1630x965, 1.37 MB | 720 px 21.2 KB, 1440 px 51.9 KB | library (unused) |
| `sheet-happy.png` | 1630x965, 1.31 MB | 720 px 19.7 KB, 1440 px 48.9 KB | web |
| `sheet-lost.png` | 1630x965, 1.34 MB | 720 px 21.0 KB, 1440 px 52.1 KB | web (404) |
| `sheet-safe.png` | 1630x965, 1.34 MB | 720 px 23.5 KB, 1440 px 58.3 KB | web (Home) |
| `sheet-sleepy.png` | 1630x965, 1.43 MB | 720 px 24.1 KB, 1440 px 58.6 KB | library (unused) |
| `sheet-squish.png` | 1630x965, 1.32 MB | 720 px 16.3 KB, 1440 px 41.0 KB | web |
| `sheet-waiting.png` | 1600x983, 1.22 MB | 720 px 17.6 KB, 1440 px 44.1 KB | web |
| `sheet-worried.png` | 1600x983, 1.22 MB | 720 px 19.7 KB, 1440 px 48.3 KB | library (unused) |
| `use-audio.png` | 1620x971, 1.28 MB | 720 px 25.1 KB, 1440 px 61.4 KB | library (unused) |
| `use-files.png` | 1619x972, 1.21 MB | 720 px 21.0 KB, 1440 px 54.5 KB | library (unused) |
| `use-images.png` | 1606x979, 1.22 MB | 720 px 22.7 KB, 1440 px 57.6 KB | web |
| `use-more.png` | 1607x979, 1.25 MB | 720 px 25.0 KB, 1440 px 58.5 KB | library (unused) |
| `use-pdf.png` | 1623x969, 1.22 MB | 720 px 21.0 KB, 1440 px 51.5 KB | web |
| `use-video.png` | 1632x964, 1.25 MB | 720 px 22.1 KB, 1440 px 55.2 KB | web |

TOTAL 33.0 MB -> 1146 KB; PSNR min 39.6 max 45.8 MAE max 1.11


Delivered bytes in the repository (all widths, every file): 1.1 MB for the 27 pictures, against
33.0 MB of originals. The site's previous 37 art files were 0.46 MB. A visitor downloads one
width per image, chosen by `srcset`.

## Where each picture is used

| Picture | Used for |
| --- | --- |
| `use-images`, `use-pdf`, `use-video` | The three category cards on Home and Ask, and the Images one in the guide article's aside (`lib/card-images.ts`) |
| `sheet-happy` | About (and the other institutional layout), Pricing, Sign up benefits card, guide article closing band, phone menu |
| `sheet-squish` | Home closing call, Guides featured article, guide closing band |
| `sheet-waiting` | Guide article header |
| `expr-normal`, `expr-determined`, `expr-celebrate` | Tool page step cards; the compressor's drop zone, working and finished banners |
| `expr-smiling`, `expr-excited`, `expr-squishing`, `expr-sad` | The compressor panel (finished, drag over, working, error) |
| `expr-smiling` | Contact |
| `expr-wink` | Sign in |
| `expr-idea` | Docs, help card |
| `sheet-lost` | **New.** The 404 page, English and Portuguese |
| `sheet-safe` | **New.** Home, "Private by design" card |

### The four new sheets

- **`sheet-lost` (Mochi with a map): the 404 page.** Replaces `sheet-worried` in the same slot and
  box (320 px, `rounded-mascot`). It says what the page says, "this page wandered off", more
  precisely than a worried face. The box is 7 px lower than before (the sheet is 1.69:1, the old
  one 1.63:1) and the text moves up with it; there is no layout shift. HTTP status, `noindex` and
  headers are unchanged.
- **`sheet-safe` (a padlocked folder): Home, "Private by design".** The card's text is the
  promise (nothing is uploaded, nothing for us to keep) and the picture shows it without
  adding a claim. It replaces `sheet-happy` there, so Home no longer repeats the same character in
  two nearby sections. It is the one place chosen: About and the tool pages already say it in text,
  and a second padlock would turn it into decoration.
- **`sheet-done` (a finished file with a green check): kept in the library.** The only place that
  hands over a result is the compressor panel, whose banners are 72-96 px circles-and-text rows
  with a reserved height and the 22 approved states; a 16:9 scene does not fit there without
  moving the Download buttons or the reserve. Everywhere else on the site nothing is ever
  completed (the contact form says explicitly that nothing was sent), so it would be a picture
  without an event.
- **`sheet-sleepy` (asleep on a cushion): kept in the library.** The site has no empty state to
  hold it (none was found in the pages or the tool), and a sleeping character beside a running
  operation would contradict the interface. Candidates if one is wanted later: the Sign
  in and Sign up pages (an account does not exist yet) or the Ask page (the assistant is a concept),
  both of which would need a design decision, because each already has a mascot.
- **`sheet-worried`** has no use after the 404 changed to `sheet-lost`; it is in the library.

Also in the library: `use-audio`, `use-files`, `use-more` (no card shows them yet; Home has three
cards and "Video and audio" uses `use-video`) and `expr-confused`, `expr-sleeping`,
`expr-surprised`, `expr-tired` (the 22 compressor states are approved and use the other seven).

## Old to new

| Old file (design reference) | New |
| --- | --- |
| `sheet-happy.png` (380/700/800/1100, and 380/760, and a 700 px PNG) | `sheet-happy-720/1440` |
| `sheet-squish.png` (380/700/800) | `sheet-squish-720/1440` |
| `sheet-waiting.png` (380/696) | `sheet-waiting-720/1440` |
| `sheet-worried.png` (320/694) | `sheet-lost-720/1440` on the 404 page; `sheet-worried` in the library |
| `use-{images,pdf,video}.png` (`-1x`, `-2x`) | `use-*-720/1440` |
| `expr-*.png` (144/168/192/276 px; 7 in the compressor) | `expr-*-288` |

The new `sheet-squish` has no progress bar (the old one drew one under the character). Every use
is decoration (`alt=""`), so no text refers to it.

Before and after (DPR 2, 1440 px: the 404 page, About, Home's privacy card):
[`docs/integration/images/mascot-refresh-before-after.webp`](../../integration/images/mascot-refresh-before-after.webp).

## Not changed

- The wordmark and symbol (`Logos/`), `assets/logo/`, the favicons and `apple-touch-icon.png`,
  and the Home hub's app icon (`assets/home/sheet-app-icon-208.webp`: it is not part of this
  collection). The favicon was **not** replaced; see the pull request.
- `docs/design-ref/` (the artboards and their `assets/`) is the historical reference and was not
  modified.

## Originals

The 27 PNGs are 33 MB, too heavy to add to a public repository for good. They are kept outside git
(the designer's `new assets` folder, copied to `docs/design-ref/mascot-collection-2026-10/`, beside the older reference,
which is not tracked either). SHA-256 of each original, so a copy can be verified:

- `expr-celebrate.png` 1d30c9f8231ac4e606412940d3d4e98a2822a1e11086aee7d3b43cf42d1175a2
- `expr-confused.png` ca56de63ae548c64baf75d34d16ec7019f3d1ab4ab6591d7c038c05b596b889c
- `expr-determined.png` 613f8539eb8f83c121de6a05e01cf4ad133c800bd23cbd958677bd13a0ec0611
- `expr-excited.png` 88ee29a49e44a26a3b792aad7c1f02258a88e80cabd276d619047538416c5d3c
- `expr-idea.png` 53fb8ac072ddbc7d7b97a4b0ffdac2ca33f6b5b1ca2a1bf95746db23f3f891d7
- `expr-normal.png` 948106eebabe53481e58a6b4f532d407e91a4aa6746cead5b66710e37e400e6b
- `expr-sad.png` fe238fb8cfde4f9202c033c5a94cb02652ff7012c1f38383128deeebeba223dc
- `expr-sleeping.png` 803943d189875ba820d22ebd750be6b3a6561a1331904fd2bae1c86547a0790e
- `expr-smiling.png` 090f9edd611a97ff65f78d81c4fce26f54450207a075a7afb87f24d9ba6d0254
- `expr-squishing.png` 516e04832e751230c77430aec88c76c636a40879949005d7a52eb24da644847f
- `expr-surprised.png` 612cc68042520c8986c90cbcdf07dfe35843d271cd7ac67f4110315304111dd5
- `expr-tired.png` 54785bf289bd7dc15e4ec04f6add31297903ccb3834d1e764f5f91d3509fc7dc
- `expr-wink.png` 6f68de4f0103e3db8be9878d2bd2a1014069c84aebddfbdcab08fb3f744b733e
- `sheet-done.png` ff40abafc498daafa581bdeadb05f45ceb99bc9346330885374fff9fc38a7817
- `sheet-happy.png` 84b823b76e6422e3ed491b16271d2c57aa09b03fb7e88e922322d5a2c89ab4a8
- `sheet-lost.png` 2fb798f62370ad9531f16773f67cb5fbfe2af0ead62d2312c0aaaf2f5bd197f5
- `sheet-safe.png` ccc441deb19e0e2c993253a177b0dcc6f84ab97eca0877c9acde15efc57de9b9
- `sheet-sleepy.png` b66296c75453f7949e56e51235e3086672346a08d2a38498b6110d47f7f67f38
- `sheet-squish.png` 6e55daad417275a68322082b96b17a991224579ea439b4f42f431984fe308039
- `sheet-waiting.png` abdd171f246767f80aea5645943e7c68e70dfd712d1a5fc0c3776759e62bf6f6
- `sheet-worried.png` 1b853530bd9e3f65503ef2b8b53cdf22d73d2aee486c3587ab7bfa344e9b88d7
- `use-audio.png` c256e54dc93d831e8608b8edd59a3d4a35aafa0d2a814423af539de88c0a90ee
- `use-files.png` 7d51cd1c2139d9342ebf7edc3b95cf2b6ddb46c92c7df96c4e3c1d8b17000fdd
- `use-images.png` 182ae615c72910275c21b8c05e2892670a6d911c0a38bdc1d14849e266e315df
- `use-more.png` e4499bc96ffdabd2276e4538a97ff06a0fe571c245ed4d21a7f6b1bda2145ce5
- `use-pdf.png` 4e220cddc7e4a92136ea1661bd59360c8e0bc7e9c987a16eb1912c6a35ad8bb8
- `use-video.png` 4f36796e0c9700586599e138bed5389c15ce04e96c0b3170124e499df8853e10

## Regenerating

From an original `X.png`, with sharp (Astro's own image library, run once and not added as a
dependency): `sharp(X.png).removeAlpha().resize({ width, kernel: 'lanczos3' }).webp({ quality:
92, smartSubsample: true, effort: 6 })`, with `quality: 96` for `expr-*` at 288 px.
