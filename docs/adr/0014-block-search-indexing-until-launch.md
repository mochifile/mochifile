# 0014. Block search indexing until launch

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The site is deployed publicly from Phase 0 ([ADR 0013](0013-deploy-workers-static-assets-from-github-actions.md))
but has no real tools yet. If search engines index placeholder pages now, they may keep showing
them, and duplicate copies on `workers.dev` hosts, long after launch. We want it unindexed until
launch, with one obvious switch that cannot be half-flipped.

## Decision

A single constant, `ALLOW_SEARCH_INDEXING` in `apps/web/search-indexing.ts`, controls indexing.
It is `false` until launch. The build integration `apps/web/integrations/search-indexing.ts`
reads it and, while it is `false`:

- adds `X-Robots-Tag: noindex` to the `/*` rule of `dist/_headers`, so every response
  (pages, files, redirects, 404s) carries it on production and previews alike;
- writes a `robots.txt` that disallows everything (`User-agent: *` / `Disallow: /`).

When it is `true`, `_headers` is left unchanged and `robots.txt` allows everything and links the
sitemap. `robots.txt` is generated only by this integration; there is no copy in `public/`.

The header joins the existing `/*` rule rather than a new one: Cloudflare keeps only the last
rule for a repeated path, so a second `/*` rule would silently drop the CSP and other security
headers. Unit tests cover both states, and an e2e test checks that the header, `robots.txt` and
the CSP all match the switch.

`X-Robots-Tag` is preferred over per-page `<meta name="robots">` because it also covers
non-HTML responses and needs no template changes. (Cloudflare also adds `noindex` to
`workers.dev` Preview URLs on its own, but we do not rely on it.)

Note: `Disallow: /` stops well-behaved crawlers from fetching pages, so on its own it would
also hide the `noindex` header from them. URLs already blocked by `robots.txt` can still appear
in results without content if they are linked from elsewhere. Both measures are lifted together
at launch, so this does not matter in practice.

## How to remove it at launch

1. On a new branch (e.g. `chore/allow-search-indexing`), make exactly two changes:
   - `export const ALLOW_SEARCH_INDEXING = true` in `apps/web/search-indexing.ts`;
   - `"workers_dev": false` in `apps/web/wrangler.jsonc` (required, see step 7).
2. Run `pnpm build` and check:
   - `apps/web/dist/robots.txt` contains `Allow: /` and
     `Sitemap: https://mochifile.com/sitemap-index.xml`;
   - `grep -c X-Robots-Tag apps/web/dist/_headers` prints `0`.
3. Run `pnpm test` and `pnpm test:e2e` (the e2e test follows the switch automatically).
4. Open a PR, merge it, and wait for the `Deploy` workflow's Production job to finish.
5. Check production: `curl -sI https://mochifile.com/ | grep -i x-robots-tag` prints nothing,
   and `https://mochifile.com/robots.txt` shows `Allow: /`.
6. Submit `https://mochifile.com/sitemap-index.xml` in Google Search Console and Bing Webmaster
   Tools.
7. **Confirm the `workers.dev` host is gone:** `https://mochifile.mochifile.workers.dev/` no
   longer serves the site. Disabling it (step 1) is required, not optional: it serves the same
   pages as `https://mochifile.com`, so once noindex is lifted search engines could index it
   as duplicate content and split ranking between the two hosts. Also check on the launch PR,
   before step 4, that its Preview still deploys with `workers_dev` off.
8. Mark this ADR **Superseded** by the launch ADR, or **Deprecated**.

## Consequences

- No page can be indexed before launch, whatever host it is served from.
- Launch is one reviewed line change plus checks, not a hunt across files.
- Until launch, SEO tooling (Search Console, Lighthouse "is indexable") reports the site as
  blocked; that is expected.

## Updates

- **2026-10-02:** production moved to `https://mochifile.com`
  ([ADR 0015](0015-canonical-host-and-domain-redirects.md)). The `workers.dev` host stays enabled
  until launch so it can be compared with the custom domain, and step 7 makes disabling it part
  of the launch change.
