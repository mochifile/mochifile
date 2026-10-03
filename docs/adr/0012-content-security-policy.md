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
  inline event handlers or `style` attributes, which hashes cannot allow. The HTML is read with
  the `parse5` parser, not regular expressions (see "Dependency: parse5" below).
- Stylesheets are never inlined (`build.inlineStylesheets: 'never'`).
- Other headers: HSTS (2 years, preload), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
  `Permissions-Policy`, `Cross-Origin-Resource-Policy: same-origin` and COOP per ADR 0011.
- Adding an origin (ads, analytics, a CDN) requires a PR that explains why and updates this ADR.

### Dependency: parse5

`csp-hashes` must find inline code exactly as a browser parses it: a missed or mis-split script
produces a wrong hash. A first version used regular expressions, and CodeQL flagged it
(`js/bad-tag-filter`, high). It missed end tags such as `</script >` and treated markup inside
HTML comments as real elements. HTML cannot be tokenized reliably with regular expressions.

We use **`parse5`** (8.0.1, pinned exactly), a WHATWG-compliant HTML parser:

- **Correctness:** it implements the HTML parsing spec, so tags, comments, `<template>` content and
  raw-text elements are handled the way browsers handle them.
- **Footprint:** a `devDependency` of `@mochifile/web` only, imported only by the build
  integration. It runs in Node during `astro build` and is never bundled for the client; the
  production output contains none of its code.
- **Cost:** MIT license, one dependency (`entities`). It was already in the lockfile through
  `jsdom`, so pinning it adds no new package to the install.
- **Maintenance:** widely used (it is the parser behind jsdom), actively maintained, and
  covered by Renovate like every other dependency.

Alternatives considered: tighter regular expressions (still not a real parser, so the next edge
case would slip through) and `ultrahtml` (already installed through Astro, but a lightweight
parser rather than a full implementation of the HTML spec, and we would still need to declare it).

## Consequences

- XSS impact is sharply limited; clickjacking is blocked.
- E2E tests run in Chromium, Firefox and WebKit against the real headers and fail on any CSP
  violation, so a regression is caught before deploy.
- Tools must not use inline styles; React components use Tailwind classes.
- The global header lists the union of all inline hashes; if that grows large, move to
  per-route policies.
- Camera access is disabled by `Permissions-Policy`; a tool that needs it (e.g. passport photo
  capture) must enable it for its own route.
