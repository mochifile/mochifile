# AGENTS.md

The single source of truth for AI coding agents (Claude Code, Codex and others) working in this
repository. Humans should read it too. `CLAUDE.md` imports this file; do not duplicate rules
elsewhere.

## Project overview

Mochifile is a global, multilingual web app of simple file tools for non-technical users
(compress an image to a target size, passport photo maker, HEIC conversion, video compression
for WhatsApp, audio transcription, PDF compression…).

- Tools run **client-side** in Web Workers whenever possible (privacy, near-zero server cost).
- Pages are static and **extremely fast** (SEO matters).
- The UI is **friendly to laypeople**: plain words, big targets, clear errors.
- **Open core:** this repo is public (AGPL-3.0). Accounts, payments and server-side AI live in
  the private `mochifile/cloud` repository. Never add them here.
- **Brand:** always write "Mochifile". Never "Mochi" alone — in code, copy, docs or commits.

Current phase: **Phase 0 (foundation)**. No real tools, WebAssembly engines, ads, auth,
payments or analytics yet.

## Commands

Run from the repository root (Node 24, pnpm 12):

```sh
pnpm install --frozen-lockfile   # install (use plain `pnpm install` only when changing deps)
pnpm dev                         # dev server on http://localhost:4321
pnpm lint                        # Biome lint + format check  (pnpm lint:fix to apply fixes)
pnpm typecheck                   # tsc / astro check in every package
pnpm test                        # Vitest unit tests
pnpm build                       # Paraglide compile + Astro static build
pnpm test:e2e                    # Playwright on chromium, firefox, webkit
pnpm --filter <package> <script> # run a script in one package, e.g. @mochifile/tool-kit test
```

Before you finish any change, run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`,
and `pnpm test:e2e` if you touched pages, routing, headers or a tool's UI.

## Repository layout

| Path | Package | Purpose |
| --- | --- | --- |
| `apps/web` | `@mochifile/web` | Astro static site; React islands only where needed |
| `packages/tool-kit` | `@mochifile/tool-kit` | Tool contract, `defineToolManifest`, worker/client wrappers, file helpers |
| `packages/ui` | `@mochifile/ui` | Shared React components and design tokens (`styles.css`) |
| `packages/i18n` | `@mochifile/i18n` | Locale list, `localePath`, Paraglide messages (`/messages`) |
| `packages/tools/<id>` | `@mochifile/tool-<id>` | One tool each; `_template` is the starting point |
| `docs/` | — | `architecture.md`, `adr/`, `contributing/` |

Internal packages are **source-only**: their `exports` point at `.ts`/`.tsx` files and the site
compiles them. Only `@mochifile/i18n` has a build step (Paraglide). If a package must ever be
published to npm (for example for the private cloud repo), it will first need a real build step
(compiled JS + `.d.ts`) — do not publish source-only packages.

## Conventions

- **TypeScript strict everywhere** (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`). No `any`; prefer `unknown` + narrowing. No non-null `!`
  unless a comment explains why it is safe.
- **Biome** is the only linter/formatter: 2 spaces, single quotes, no semicolons, trailing
  commas, 100 columns. Never add ESLint or Prettier.
- **ESM only.** Relative imports include the extension (`./files.ts`).
- **Naming:** files `kebab-case.ts`, React components `PascalCase.tsx`, tool ids and slugs
  lowercase kebab-case.
- **Shared versions** go in the pnpm `catalog:` (`pnpm-workspace.yaml`). Versions are exact.
- **Styling:** Tailwind CSS v4 utilities using the semantic tokens in
  `packages/ui/src/tokens.css` (`bg-surface`, `text-text-muted`, `bg-accent`…). No raw colors
  in components, no inline `style` attributes (the CSP forbids them).
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org), small and logical.
  Scopes: `web`, `tool-kit`, `ui`, `i18n`, `tools`, `docs`, `ci`, `deps`, or a tool id.
- **Branches:** never work on `main`. Use `feat/…`, `fix/…`, `docs/…`, `chore/…` and open a PR.
- **Comments** explain *why*, not *what*. Public APIs get JSDoc.

## Architecture rules

1. **Client-side first.** A tool's `runtime` is `browser` unless it is impossible; a `server`
   tool needs an ADR and is implemented in the private cloud repo.
2. **Heavy work runs in a Web Worker**, never on the main thread. Use `exposeTool` /
   `createToolClient` from `@mochifile/tool-kit`; do not hand-roll `postMessage` protocols.
3. **`process()` is pure:** no DOM, no network, no globals, no logging of file data. It takes
   files + options + `{ signal, onProgress }` and returns results. It must honour `signal`.
4. **Manifests are data.** Pages, routes, sitemap and SEO tags are generated from
   `manifest.ts`. Never import processing code or heavy libraries from a manifest.
5. **Zero JavaScript by default.** Astro components render static HTML; only the tool island
   ships JS, and each tool page loads only its own tool.
6. **i18n:** every user-facing string goes through Paraglide messages in every locale. English
   lives at `/`, other locales at `/<locale>/`. Never redirect by browser language. Every page
   emits canonical + `hreflang` alternates (including `x-default`). Build paths with
   `localePath()`; they always end with `/`.
7. **Cross-origin isolation** (COOP/COEP) only on the routes that need it, never globally — it
   breaks third-party ads (ADR 0011).
8. **CSP** lives in `apps/web/public/_headers`. Inline scripts/styles are hashed at build time
   by `apps/web/integrations/csp-hashes.ts`. `'wasm-unsafe-eval'` is allowed for WebAssembly;
   `'unsafe-eval'` and `'unsafe-inline'` are never allowed (ADR 0012).
9. **Pre-launch noindex.** `ALLOW_SEARCH_INDEXING` in `apps/web/search-indexing.ts` keeps the
   whole site out of search engines (ADR 0014). Do not flip it, or add another robots
   mechanism, outside the launch steps in that ADR.
10. **Deploys** run from `.github/workflows/deploy.yml` with `apps/web/wrangler.jsonc` (ADR
    0013). `_headers` rules with the same path do not merge on Cloudflare; add headers to the
    existing rule.
11. Significant decisions get an ADR in `docs/adr/` (copy `0000-template.md`).

## How to add a tool

Follow [docs/contributing/adding-a-tool.md](docs/contributing/adding-a-tool.md). In short:

1. Copy `packages/tools/_template` to `packages/tools/<tool-id>` and rename the package.
2. Edit `src/manifest.ts` (id, category, accepts, limits, defaults, per-locale slug/title/description).
3. Implement `src/process.ts` and its tests; keep it pure.
4. Build the UI in `src/Ui.tsx` with `@mochifile/ui` components.
5. Add messages in `messages/{en,pt}.json` (keys prefixed with the tool id in snake_case) and add
   the path to `pathPattern` in `packages/i18n/project.inlang/settings.json`.
6. Run everything. Pages appear automatically at `/<slug>/` and `/pt/<slug>/`.

## Testing requirements

- Every `process()` has unit tests (Vitest) covering success, options, limits and abort.
- Shared helpers and registry/SEO logic have unit tests.
- User-visible flows get Playwright smoke tests in `apps/web/e2e`; they run in all three
  engines against a production build served with the real `_headers` and fail on any console
  error or CSP violation.
- Never commit real personal files as fixtures. Generate fixtures in code or use tiny,
  synthetic, license-clean files.
- Do not lower coverage, skip, or `.only` tests to make CI pass.

## Security rules

- Treat every file as untrusted input: validate type and size (`validateFiles`) before work.
- Never log, persist or send file contents or file names to any service.
- Errors shown to users come from `ToolError` codes; unexpected errors are reduced to
  `processing-failed` so internals never leak.
- Keep the CSP strict; any new origin needs a justification in the PR and an ADR update.
- Report vulnerabilities privately to security@mochifile.com (see `SECURITY.md`).

## Never do

- ❌ Never commit secrets, tokens, keys or `.env` files. Use environment variables.
- ❌ Never upload user files to a server when a client-side path exists.
- ❌ Never log file contents (or names, or derived data) — not even in debug code.
- ❌ Never add a dependency without justification (purpose, size, license, maintenance) in
  the PR; prefer the platform and existing packages. Check the latest version on npm first
  and pin it exactly — never guess versions.
- ❌ Never work directly on `main` or force-push shared branches.
- ❌ Never add `'unsafe-eval'` or `'unsafe-inline'` to the CSP, or enable COOP/COEP globally.
- ❌ Never add analytics that set cookies or track individuals; never add ads, auth or payments
  to this public repo.
- ❌ Never write "Mochi" alone; the name is always "Mochifile".
- ❌ Never redirect users based on their browser language.
- ❌ Never bypass the tool contract (no processing on the main thread, no tool-specific code in
  `apps/web` beyond what the registry generates).

## Known constraints

- **TypeScript is pinned to 6.x**: `@astrojs/check` does not support TypeScript 7 yet.
- **Builds are offline and reproducible.** Inlang plugins are pinned npm devDependencies of
  `@mochifile/i18n`, referenced by local path in `packages/i18n/project.inlang/settings.json`.
  Never point `modules` at a URL (a test enforces this) or fetch any other remote code at
  build time.
