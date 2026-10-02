# 0008. Cloudflare hosting

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The site is fully static. We need a global CDN with good performance in Latin America and
elsewhere, custom security headers per path, generous free bandwidth (tools may load multi-MB
WebAssembly files), and a path to edge functions later.

## Decision

Host the static build (`apps/web/dist`) on **Cloudflare static assets** (Workers/Pages).
Security and caching headers are declared in `apps/web/public/_headers`. Hashed assets under
`/_astro/` are cached immutably.

## Consequences

- Global edge delivery with no servers to manage; bandwidth costs stay near zero.
- Header rules are versioned with the code. E2E tests apply the same file through a local
  server that mimics Cloudflare, so header regressions are caught in CI.
- Per-route headers (e.g. COOP/COEP for specific tools, ADR 0011) are supported by `_headers`.
- Deployment automation (Wrangler or Git integration) is a follow-up; it is not in Phase 0.
- Some coupling to Cloudflare's `_headers` format; it is simple to port.
