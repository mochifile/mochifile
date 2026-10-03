# 0020. Adopt the Mochifile design system

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

Until now the UI used provisional tokens (`packages/ui/src/tokens.css`) and system fonts. The
maintainer added [`docs/design-system/`](../design-system/README.md): a brand book
(`README.md`), `tokens.json` (colours for light and dark, type, spacing, radius, sizes), SVG
logo and mascot assets, and component guidelines in `components/<Comp>/README.md`. Agents and
contributors need one place that says how Mochifile looks, and a way to stop values drifting
from it.

## Decision

- **Source of truth.** `docs/design-system/` (brand book, `tokens.json`, component READMEs)
  decides all visual work. Read the brand book before any UI work. Use tokens by name; never
  invent a colour, size or radius. If something is missing, ask for it to be added to the
  design system.
- **Tokens are generated, never hand-written.** `pnpm --filter @mochifile/ui tokens` turns
  `tokens.json` into `packages/ui/src/tokens.generated.css`. A unit test regenerates it in
  memory and fails if the committed file differs.
- **Themes.** Light values sit on `:root`. Dark values apply when the system prefers dark
  (unless `data-theme="light"`) or when `data-theme="dark"`. Nothing sets `data-theme` yet;
  it is there for a future theme switch.
- **The Tailwind theme is restricted to the tokens.** Default colours, spacing, radii, font
  sizes and containers are reset, so `bg-red-500` or `p-7` produce nothing. Colours, radii and
  containers keep the token names (`bg-mango`, `rounded-xl`, `max-w-reading-max`), spacing
  keeps Tailwind's numbers (`p-4` = `space-4`), and type styles are `type-<style>` utilities
  that set family, size, line height, weight and tracking together.
- **Component constants.** Values the component READMEs give but `tokens.json` lacks (the
  2.5 px outline and dashed border, the 2 px chip border, button icons, the tool card height,
  the 600 px breakpoint) live in `packages/ui/src/component-constants.css`, each citing its
  README. Only that file and the generated tokens may hold raw values.
- **The squish.** Large surfaces use squished corners, as the brand book describes: three
  patterns per radius (`rounded-{md,lg,xl,2xl}-squish-{a,b,c}`), within 2–6 px of the token.
  Pattern A is the documented example.
- **Design guard.** A unit test scans code and style files (`.ts`, `.tsx`, `.astro`, `.css`)
  for raw colours and arbitrary Tailwind values with raw lengths, and fails with file and
  line. SVG assets and license texts are not scanned: illustrations legitimately contain hex
  colours.
- **Fonts are self-hosted.** Fredoka and Figtree come from pinned `@fontsource-variable`
  packages (OFL-1.1) through Astro's local font provider, Latin subset only (it includes the
  dotless ı of the wordmark). Astro generates metric-matched fallbacks, so swapping fonts
  shifts nothing. Noto Sans stays in the font stack but is not downloaded while every locale
  is Latin; download it when a non-Latin locale is added. Both fonts are listed in the
  third-party notices. The CSP stays `'self'`: Astro's inline `@font-face` styles are hashed
  like any other inline style.
- **Mobile fold rule.** On a 390 × 844 phone, in every language, every tool page's primary
  action (`[data-primary-action]`) is fully visible on first view, without scrolling. An e2e
  test enforces it on every tool page and variant in the sitemap. To meet it, the hero
  block holds the breadcrumb and the H1 only (the brand book's "one-line purpose" waits for a
  short per-page line; the longer meta description leads the copy below the tool), and size
  chips use `space-3` side padding so the six presets fit on two rows.
- `docs/design-system/` is excluded from Biome: it is maintained as given, not reformatted.

## Consequences

- Changing a colour or size means editing `tokens.json` and regenerating; the drift test
  catches a forgotten regeneration.
- Tailwind silently ignores classes that no longer exist; the guard and a review of the built
  CSS catch them, and the existing axe tests catch broken contrast.
- Fonts add about 50 KB (two variable woff2 files), preloaded. Lighthouse is compared before
  and after the restyle.
- The logo and mascot are provisional in the brand book; they are implemented as specified and
  will be replaced when the final drawings exist.
