# 0012. Content Security Policy

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Mochifile processes personal files in the browser. A cross-site scripting bug would let an
attacker read those files, so a strict Content Security Policy (CSP) is an important second line
of defense. Constraints:

- WebAssembly engines arrive in Phase 1. Compiling WebAssembly is blocked under a CSP with
  `script-src` unless `'wasm-unsafe-eval'` is present.
- Astro islands inject a few small inline `<script>` and `<style>` elements.
- Workers and results use `blob:` URLs.
- A `<meta>` CSP cannot set `frame-ancestors`, and two CSPs (header + meta) intersect, which
  makes Astro's built-in meta-tag CSP awkward to combine with a header policy.

## Decision

The CSP is sent as an HTTP header from `apps/web/public/_headers`:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval' <hashes>; style-src 'self' <hashes>;
img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self';
worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

- `'wasm-unsafe-eval'` is allowed **now**, so Phase 1 engines work. It permits compiling
  WebAssembly only; it does not allow JavaScript `eval`.
- **`'unsafe-eval'` must never be added.** It would allow `eval()`/`new Function()` and turn
  many injection bugs into code execution. Libraries that need it are rejected or patched.
- **`'unsafe-inline'` must never be added** to `script-src` or `style-src`. Instead, the
  `csp-hashes` Astro integration (`apps/web/integrations/csp-hashes.ts`) hashes every inline
  script and style in the build output and appends the hashes to `_headers`. The build fails on
  inline event handlers or `style` attributes, which hashes cannot allow.
- Stylesheets are never inlined (`build.inlineStylesheets: 'never'`).
- Other headers: HSTS (2 years, preload), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
  `Permissions-Policy`, `Cross-Origin-Resource-Policy: same-origin` and COOP per ADR 0011.
- Adding an origin (ads, analytics, a CDN) requires a PR that explains why and updates this ADR.

## Consequences

- XSS impact is sharply limited; clickjacking is blocked.
- E2E tests run in Chromium, Firefox and WebKit against the real headers and fail on any CSP
  violation, so a regression is caught before deploy.
- Tools must not use inline styles; React components use Tailwind classes.
- The global header lists the union of all inline hashes; if that grows large, move to
  per-route policies.
- Camera access is disabled by `Permissions-Policy`; a tool that needs it (e.g. passport photo
  capture) must enable it for its own route.
