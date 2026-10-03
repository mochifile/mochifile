# Architecture

This document describes how Mochifile is put together. The reasoning behind each choice lives
in the [architecture decision records](adr/).

## Goals

1. **Privacy:** files stay on the user's device whenever technically possible.
2. **Speed:** static pages, no JavaScript unless a tool needs it, small per-page bundles.
3. **Reach:** every page exists in every locale with its own URL, so search engines can find it.
4. **Low cost:** browser processing means almost no server compute; the site is static.
5. **Easy contributions:** a new tool is one self-contained package that follows one contract.

## High-level view

```
                         ┌───────────────────────── public repo (AGPL-3.0) ──────────────────────────┐
                         │                                                                           │
 packages/tools/<id>     │  manifest.ts ──────────────┐            Ui.tsx ──┐      worker.ts ─ process.ts
   (one per tool)        │   (data: id, accepts,       │             (React)  │        (Comlink)   (pure)
                         │    limits, meta per locale) │                      │                         │
                         │                             ▼                      ▼                         │
 apps/web (Astro)        │  src/lib/tools.ts ── registry ──► [tool].astro pages ──► ToolIsland ─ lazy ─┘
                         │        ▲                         (+ hreflang, sitemap)    (client:only)      │
 packages/i18n           │        └── locales, localePath, Paraglide messages                           │
 packages/tool-kit       │  contract types, defineToolManifest, exposeTool, createToolClient, helpers  │
 packages/ui             │  React components + design tokens (Tailwind v4 @theme)                      │
                         └───────────────────────────────────────────────────────────────────────────┘
                                                      │ static files + _headers
                                                      ▼
                                         Cloudflare (static assets, CDN)

                         ┌──────────────── private repo: mochifile/cloud (future) ───────────────────┐
                         │ accounts · payments (Paddle) · server-side AI · runtime: 'server' tools   │
                         └───────────────────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Responsibility | Depends on |
| --- | --- | --- |
| `@mochifile/i18n` | Locale list, `localePath()`, compiled Paraglide messages | — |
| `@mochifile/tool-kit` | The Tool contract, manifest validation, worker/client wrappers, file helpers, errors | i18n, comlink |
| `@mochifile/ui` | Accessible React components, design tokens | react (peer) |
| `@mochifile/engine-image` | Image engine for tool workers: WebAssembly codecs (jSquash), native decoding with probes, metadata stripping, size targeting ([ADR 0016](adr/0016-image-engine-jsquash-with-native-decoding.md), [ADR 0017](adr/0017-size-targeting-algorithm.md)) | tool-kit, @jsquash/* |
| `@mochifile/tool-*` | One tool: manifest, process, worker, UI, messages, tests | tool-kit, ui, i18n |
| `@mochifile/web` | The Astro site: layouts, pages, registry, SEO, CSP, e2e tests | everything above |

Internal packages are source-only (TypeScript compiled by the site's Vite build). Only
`@mochifile/i18n` has a build step, to generate Paraglide's message functions.

## The Tool contract

Defined in [`packages/tool-kit/src/contract.ts`](../packages/tool-kit/src/contract.ts). A tool is
split in two so that pages stay light:

- **`ToolManifest`** — serializable data: `id`, `category`, `runtime`, `accepts`, `limits`,
  `defaults` and per-locale `meta` (`slug`, `title`, `description`). Validated by
  `defineToolManifest()`. The site reads only manifests to build pages.
- **`ProcessFn`** — `(files, options, { signal, onProgress }) => Promise<ToolResult[]>`. Pure and
  testable; runs inside a Web Worker. It is never imported by a page.

## Request and data flow

### Build time

1. `@mochifile/i18n` compiles the message JSON files (site + every tool) into typed functions.
2. `apps/web/src/lib/tools.ts` globs `packages/tools/*/src/manifest.ts`, validates uniqueness
   of ids and slugs, and exposes the registry (the `_template` tool only in dev/e2e).
3. Astro renders `/`, `/pt/`, and `/<slug>/` + `/pt/<slug>/` for every tool, each with canonical
   and `hreflang` links, plus an i18n-aware sitemap.
4. The `csp-hashes` integration hashes Astro's inline island scripts/styles into `_headers`.

### Run time (browser tool)

```
User picks files
   │
   ▼
Ui.tsx ── createToolClient(manifest, () => new Worker(...))
   │  1. validateFiles() — type, size, count (instant feedback, nothing sent anywhere)
   │  2. lazily starts the worker on first use
   ▼
Web Worker ── exposeTool(defineTool(manifest, process))
   │  3. validateFiles() again (defense in depth)
   │  4. merges options with manifest.defaults
   │  5. process(files, options, { signal, onProgress })   ← WebAssembly engines live here (Phase 1)
   │  6. waits until every progress update was delivered, then replies
   ▼
Ui.tsx receives ToolResult[] (Blobs) → object URL → download
```

- Cancellation: the UI's `AbortSignal` calls `abort(jobId)` in the worker, which aborts the
  `signal` passed to `process()`.
- Errors cross the worker boundary as `{ code, message }`. Expected failures use `ToolError`
  codes the UI translates; unexpected errors become `processing-failed` so internals never leak.
- Nothing is uploaded. No file data or names are logged.

## Client vs server processing

| | Browser (`runtime: 'browser'`) | Server (`runtime: 'server'`) |
| --- | --- | --- |
| Default | **Yes** — every tool unless impossible | Exception, requires an ADR |
| Where the code lives | This repo | Private `mochifile/cloud` repo |
| Examples | Image compression, HEIC conversion, passport photo, PDF compression, video via WebAssembly | Large-model transcription or AI features too heavy for devices |
| Data handling | Files never leave the device | Upload over TLS, processed in memory, deleted immediately, documented in the privacy policy |
| Cost | ~zero | Compute per job — candidates for paid plans |

Some tools may offer both: browser by default, with an optional server path for files too large
for the device, always with explicit user consent.

## Pages and performance

- Astro renders static HTML. Home and content pages ship **zero JavaScript**.
- Tool pages have exactly one island (`ToolIsland`, `client:only`) that lazy-loads the tool's
  `Ui.tsx`; the worker and its engine load only when the user starts a job.
- Tailwind CSS v4 produces one small stylesheet; there are no inline styles.

## Internationalization

English at `/`, other locales at `/<locale>/`, no language-based redirects, `hreflang` on every
page (`x-default` → English), localized slugs per tool. See [ADR 0007](adr/0007-i18n-per-locale-urls.md)
and the [i18n guide](contributing/i18n.md).

## Security

- Strict CSP and security headers in `apps/web/public/_headers` ([ADR 0012](adr/0012-content-security-policy.md)).
- Cross-origin isolation only on routes that need `SharedArrayBuffer` ([ADR 0011](adr/0011-cross-origin-isolation-per-route.md)).
- Privacy by design, cookieless analytics only ([ADR 0009](adr/0009-privacy-by-design.md)).
- CodeQL and Renovate keep code and dependencies in check.

## Hosting

The static output (`apps/web/dist`) is served by an assets-only Cloudflare Worker, which applies
`_headers` and handles trailing slashes ([ADR 0008](adr/0008-cloudflare-hosting.md)). The
`Deploy` workflow publishes a Preview for each pull request and production from `main`
([ADR 0013](adr/0013-deploy-workers-static-assets-from-github-actions.md),
[setup](contributing/deployment.md)). Until launch every response carries
`X-Robots-Tag: noindex` ([ADR 0014](adr/0014-block-search-indexing-until-launch.md)). The
canonical host is `https://mochifile.com`; `www.mochifile.com` and `mochifile.app` redirect to
it ([ADR 0015](adr/0015-canonical-host-and-domain-redirects.md)).
