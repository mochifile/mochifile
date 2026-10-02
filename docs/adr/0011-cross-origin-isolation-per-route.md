# 0011. Cross-origin isolation only on pages that need it

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Some WebAssembly engines (multi-threaded video/audio encoders, some ML runtimes) need
`SharedArrayBuffer`, which browsers only expose on **cross-origin isolated** pages: served with
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or
`credentialless`). Isolation blocks cross-origin resources that do not opt in and breaks
cross-origin popups — which breaks typical **third-party ads** and some embeds. Ads may fund
the free tier later.

## Decision

- **Do not enable COOP `same-origin` + COEP globally.** The baseline `_headers` sets
  `Cross-Origin-Opener-Policy: same-origin-allow-popups` and no COEP.
- A tool that needs `SharedArrayBuffer` gets COOP/COEP through a **route-specific** rule in
  `_headers` (both locales' paths), documented in its PR. Such pages carry no third-party ads.
- Tools should prefer single-threaded engines, or degrade gracefully when
  `crossOriginIsolated` is false.

## Consequences

- Most pages remain compatible with ads and embeds.
- Isolated tool pages must self-host every resource (or serve it with CORP/CORS).
- E2E tests assert that COEP is not sent globally.
