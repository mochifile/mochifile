# 0015. Canonical host mochifile.com and domain redirects

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The site runs as the `mochifile` Worker ([ADR 0013](0013-deploy-workers-static-assets-from-github-actions.md)).
We own `mochifile.com` and `mochifile.app`, both registered through Cloudflare Registrar and on
the same Cloudflare account. Search engines and users should see one host. `mochifile.com`
already uses Cloudflare Email Routing (MX, SPF and DKIM records), which must keep working.

A Worker Custom Domain matches one exact hostname, so other hostnames need their own handling.
Cloudflare's documented options for redirecting hostnames are Redirect Rules (or Bulk
Redirects) on a proxied placeholder DNS record. A redirect Worker would also work, but every
redirected request would count as a Worker invocation and would add code to maintain.

## Decision

- **`https://mochifile.com` is the canonical host.** It is a Worker Custom Domain declared in
  `apps/web/wrangler.jsonc` (`routes`, `custom_domain: true`), so `wrangler deploy` creates
  its DNS record and certificate. Wrangler never overwrites an existing DNS record
  (`override_existing_dns_record: false`), so the Email Routing records are not touched. The
  domain is declared only in the config, because a deploy removes Custom Domains that exist only
  in the dashboard.
- **Every other host redirects with a 301 to `https://mochifile.com`**, keeping the path and
  query string, via Cloudflare **Redirect Rules** (Single Redirects):
  - zone `mochifile.com`: `www.mochifile.com` → `https://mochifile.com<path>`;
  - zone `mochifile.app`: `mochifile.app` and `www.mochifile.app` → `https://mochifile.com<path>`.
  Each redirected hostname has a proxied `AAAA` record pointing to `100::`, Cloudflare's
  placeholder for setups with no origin. Requests never reach that address.
- **Always Use HTTPS** is on for both zones, so `http://` requests become `https://` first.
- The redirects are dashboard configuration (the deploy token has no rights to change zone
  rules). Their exact settings are in
  [docs/contributing/deployment.md](../contributing/deployment.md#domains), which is the source
  of truth. Change both together.
- `mochifile.<subdomain>.workers.dev` stays enabled while the site is noindexed, and is disabled
  at launch ([ADR 0014](0014-block-search-indexing-until-launch.md)).

## Consequences

- One canonical host, matching `site` in `astro.config.ts`, canonical links, `hreflang` and the
  sitemap, which already use `https://mochifile.com`.
- Redirects run at Cloudflare's edge before the Worker, cost nothing, and need no code.
- The redirects live outside the repository, so a dashboard change could break them unnoticed.
  The deployment guide has `curl` checks to run after any change.
- The `Strict-Transport-Security` header (`includeSubDomains`) covers every subdomain of
  `mochifile.com`. Every web hostname there must keep serving HTTPS. Email Routing is unaffected
  because it does not use the web.
- `mochifile.app` is on a TLD that browsers already force to HTTPS.
