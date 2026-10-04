# 0021. Subset the brand fonts and preload only the display face

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

[ADR 0020](0020-adopt-the-mochifile-design-system.md) self-hosts Fredoka and Figtree from the
Fontsource Latin files (30 KB and 20 KB) and preloaded both. On tool pages, Lighthouse
(mobile, local production build) then put the largest contentful paint, the Fredoka H1, at
2.9–3.2 s, against a target of 2.5 s.

## Decision

- **Subset.** `apps/web/fonts/subset.ts` subsets both fonts to a fixed character set: printable
  ASCII, Latin-1 (every Portuguese letter), the wordmark's dotless ı, typographic punctuation,
  → − › and the spaces number formatting produces. It also limits the weight axis to the
  weights the brand book uses: Fredoka 500–700, Figtree 400–700. The generated woff2 files are
  committed in `apps/web/fonts/`, so builds stay offline. The generator is `subset-font`
  (HarfBuzz), a dev dependency only. The OFL allows modified versions; neither font declares
  a Reserved Font Name, so the subsets keep their names.
- **Tests.** One test regenerates the files and fails if the committed ones differ. Another
  fails if any UI message, page copy, manifest or page uses a character outside the set, so a
  new letter never silently falls back to another font. Characters meant to come from the
  fallback font are allowlisted (today only ⌘).
- **Preload only Fredoka**, which draws the H1. Figtree is fetched when the CSS needs it.
- **Figtree uses `font-display: optional`.** If it is not ready almost at once, the page keeps
  Figtree's metric-matched fallback for that view, with no swap and no shift; later pages use
  the cached font. Fredoka keeps `swap`, so headings always end in the brand face.
- A new locale with characters outside the set means extending `CHARSET` and regenerating
  (`pnpm --filter @mochifile/web fonts`); non-Latin scripts still need Noto Sans (ADR 0020).

## Consequences

- Fonts shrink from 49 KB to 43 KB, and only 26 KB are preloaded.
- On a slow first visit, body text may stay in a metric-matched system font
  until the next page.
- With the agreed local method, tool-page LCP moved from 2.9–3.2 s to 2.7–2.9 s. Most of the
  remaining gap comes from the local test server sending JavaScript uncompressed (213 KB
  where production sends about 66 KB with brotli): Lighthouse's simulation counts every
  request started before the LCP. Served compressed like production, LCP is 1.7–1.8 s.
