# 0024. The lettered wordmark in the header, footer and READMEs

- **Status:** Proposed in [PR #42](https://github.com/mochifile/mochifile/pull/42); Accepted
  on merge
- **Date:** 2026-10-26
- **Amended by:** [ADR 0030](0030-v2-site-shell.md): the official lettering files replace the
  masters and copies below, the logo is 151px wide, and the footer has no logo

## Context

The maintainer approved new lowercase lettering for "mochifile": heavy rounded letters with a
coral and a green dot on the two i's. The v1 logo (ADR 0020) was a vector lockup of the symbol
and a thin monoline wordmark, inline in the header and footer. The approved lettering exists
only as raster images, one per ground: ink letters for light grounds and cream letters for dark
ones.

## Decision

This ADR supersedes only the logo usage in [ADR 0020](0020-adopt-the-mochifile-design-system.md)'s
"Logo (final v1)" decision: the horizontal vector lockup in the header and footer, the 200 px
width, and the letters following the text colour. ADR 0020 stays as the record of what was
decided on 2026-10-04. Everything else in it still holds: the design tokens, the symbol, the
favicons and app icons, the accessible name "Mochifile", the 96 px minimum, the clear space of
one "o" on every side, and the dots keeping their own colours in every theme.


- **Files.** The masters are `mochifile-wordmark-light.png` and `mochifile-wordmark-dark.png`
  in `docs/design-system/assets/Logos/`: lossless 8-bit RGBA, 960 px wide, transparent, trimmed
  to the lettering. `light` and `dark` name the colour scheme the file is shown in, so the
  `-light` file has ink letters. The artwork is used as approved, not redrawn or traced to SVG;
  only faint matting residue around the letters (alpha 5/255 or less) was removed.
- **Wordmark alone.** The header and footer show the wordmark without the symbol. Beside the
  heavy lettering, the thin-outline symbol read as a different hand, and the mascot is already
  on the page (one mascot per region). The symbol stays the favicon and app icon.
- **Theme without a script.** The header holds both files and `global.css` shows the one that
  matches the theme with the selectors the tokens use: the system's colour scheme unless
  `data-theme="light"`, or forced by `data-theme="dark"`. Both are lazy, so the hidden one is
  never downloaded. The footer is an ink block in both themes and only has the cream file.
- **Weight.** The site ships 368 and 552 px copies (256-colour palette, no dithering, at most
  8/255 off the master on an edge pixel) chosen by `srcset`: 12 KB on most screens, not the 59 KB
  master. `<picture>` and Astro's image service were not used: the first follows only the system
  preference, not a forced theme, and the second needs `sharp` as a direct dependency.
- **Size.** Widths stay 120 px under 600 px and become 184 px from 600 px (was 200 px). At 184 px
  the wordmark is 32.8 px tall, like the 200 px lockup (32.4 px), and its clear space, the "o"
  (0.715 of the height, 23.5 px), fits the existing 24 px gap and margin. Each image's
  proportions are pinned in CSS, so a copy rounded to whole pixels never moves the layout.
- **Name.** The link keeps its accessible name "Mochifile"; the images are decorative and
  `aria-hidden`, so the name is announced once. No CSP change: the images are same-origin.
- The READMEs show the files with `<picture>` and `prefers-color-scheme`, which GitHub follows.

## Consequences

- The v1 drawn wordmark and the horizontal and stacked lockups are no longer used by the site;
  they stay in the design system folder with the symbol, favicons and app icons.
- The logo is raster: it cannot follow `currentColor`, so each ground needs the right file.
  A vector master would replace the files under the same names.
- The dots are drawn in the artwork and differ slightly between the two files; they are not the
  `strawberry` and `matcha` tokens. The brand rule that the dots never change still holds.
- The organization profile README links to the masters on `main`, so a change to their path
  must update `mochifile/.github` too.
