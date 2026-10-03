# 0013. Deploy to Cloudflare Workers static assets from GitHub Actions

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

[ADR 0008](0008-cloudflare-hosting.md) chose Cloudflare and left the deployment mechanism open.
We need production deploys from `main` and a preview per pull request, for a static Astro build
in a pnpm monorepo that relies on `_headers` for its CSP and security headers.

Findings (Cloudflare docs, October 2026):

- **Workers vs Pages.** Cloudflare's Pages docs say Workers "is Cloudflare's primary platform
  for building applications. Start new projects with Workers." An assets-only Worker (no
  script) serves a static site.
- **`_headers`** is supported natively by Workers static assets when it sits in the assets
  directory. It applies only to static assets, never to responses produced by Worker code. Limits:
  100 rules, 2,000 characters per line.
- **Routing.** `html_handling: "auto-trailing-slash"` serves `pt/index.html` at `/pt/` and
  redirects `/pt` to `/pt/`. `not_found_handling: "404-page"` serves `404.html` with status
  404.
- **Previews.** For pull requests Cloudflare recommends Previews (`wrangler preview`) over
  aliased Version URLs: "Do not use Version URLs for branch or pull request testing." Previews
  need wrangler ≥ 4.135.0, are in open beta, and do not require a production deploy first.
- **Workers Builds** (Cloudflare's Git integration) can also build and preview, but it builds in
  Cloudflare's image (pnpm 10 by default; we use pnpm 12), keeps commands and variables in the
  dashboard, and runs dependency code in the same container as the deploy credentials.

Verified locally with `wrangler dev` against our build: `/`, `/pt` → `/pt/`, `/pt/`,
`/sitemap-index.xml`, `robots.txt` and 404s all return the `_headers` security headers, and
`_headers` itself is not served. It also showed that **two `_headers` rules with the same path
do not merge; the last one wins** (see [ADR 0014](0014-block-search-indexing-until-launch.md)).

## Decision

- Serve `apps/web/dist` as an assets-only Worker named `mochifile`, configured in
  `apps/web/wrangler.jsonc` (`auto-trailing-slash`, `404-page`, an empty `previews` block).
- Deploy from GitHub Actions (`.github/workflows/deploy.yml`) with wrangler pinned as a
  devDependency of `@mochifile/web` (updated by Renovate):
  - pull requests from this repository → `wrangler preview --name pr-<number>`, linked from the
    pull request as the `preview` environment;
  - pushes to `main` → `wrangler deploy` (the `production` environment);
  - closed pull requests → `wrangler preview delete`.
- The build runs in a job **without** Cloudflare credentials and hands `dist/` over as an
  artifact. Only the deploy jobs see the token, and the only dependency code they run is
  wrangler. Pull requests from forks get no secrets and therefore no preview.
- Credentials are two repository secrets: `CLOUDFLARE_API_TOKEN` (an account-scoped "Edit
  Cloudflare Workers" token) and `CLOUDFLARE_ACCOUNT_ID`. Setup steps:
  [docs/contributing/deployment.md](../contributing/deployment.md).
- The build fails if any `_headers` line exceeds Cloudflare's 2,000-character limit, since the
  CSP grows with each inline hash.
- The e2e server (`apps/web/e2e/serve.ts`) mirrors Cloudflare by letting a repeated rule path
  replace the earlier rule instead of merging.

## Consequences

- Same Node and pnpm as CI, all configuration versioned and reviewed, and a pinned wrangler.
- Production is reachable at `mochifile.<account subdomain>.workers.dev` until a custom domain
  is attached in a follow-up (add a `routes` entry with `custom_domain: true` once
  `mochifile.com` is a zone in the same Cloudflare account; the token then also needs zone
  permissions).
- Previews live on `pr-<number>-mochifile.<account subdomain>.workers.dev` and are public, like
  any `workers.dev` URL. Cloudflare Access can be added later if previews must be private.
  Free accounts keep up to 100 Previews; the oldest are deleted automatically.
- Previews are an open-beta feature. If they change, the fallback is
  `wrangler versions upload --preview-alias pr-<number>`.
- The `Deploy` workflow is not a required check: it needs secrets, which fork pull requests
  do not get. CI and CodeQL remain the merge gates.
- A long-lived API token is stored in GitHub. It is scoped to one account and Workers edits, and
  is never exposed to the build job.
