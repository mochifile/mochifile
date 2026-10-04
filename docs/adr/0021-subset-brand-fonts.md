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
- **Preload only Fredoka**, which draws the H1. Figtree is fetched when the CSS needs it. Both
  use `font-display: swap` with Astro's metric-matched fallbacks, so text shows at once and
  nothing shifts when the fonts arrive.
- **Lighthouse method.** Lighthouse (mobile, 13.5.0, 3 runs per page) runs on a local
  production build served by `apps/web/e2e/serve.ts`, which applies the real `_headers` and,
  since this decision, **compresses like production**: Cloudflare sends text, JS, CSS, JSON,
  XML, SVG and WebAssembly with brotli at quality 4 (gzip when brotli is not accepted) and
  fonts and images as they are, which `serve.ts` reproduces (sizes within 0.1% of
  mochifile.com). Before, it sent
  everything uncompressed: the tool's 213 KB JavaScript (66 KB as served) was counted in the
  simulated LCP, adding about a second. Numbers measured before this change are not
  comparable with later ones.
- A new locale with characters outside the set means extending `CHARSET` and regenerating
  (`pnpm --filter @mochifile/web fonts`); non-Latin scripts still need Noto Sans (ADR 0020).

## Consequences

- Fonts shrink from 49 KB to 43 KB, and only 26 KB are preloaded.
- With the method above, tool-page LCP is 1.8–2.0 s (2.0 s before these changes) and the home
  page's 1.2 s, under the 2.5 s target. Home FCP moved from 0.8 s to 1.1 s.
- Under the old, uncompressed method the subsets alone did not reach the target; trying
  `font-display: optional` for Figtree helped a little there but kept the brand body font from
  most first visits, so it was dropped once the method matched production.
