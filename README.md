# Mochifile

**Simple file tools that run in your browser.** Compress an image to a target size, make a
passport photo, convert HEIC, shrink a video for WhatsApp, compress a PDF — without installing
anything and, whenever possible, without your files ever leaving your device.

Mochifile is built for people who just want the job done: friendly pages, no jargon, fast on
any phone, available in several languages.

> **Status:** Phase 0 (foundation). The site, the tool contract and the tooling are in place;
> the first real tools come next.

## Principles

- **Private by design.** Tools run client-side (Web Workers + WebAssembly) whenever possible.
  Files are never uploaded when a browser path exists.
- **Fast.** Static pages with zero JavaScript by default; each tool page loads only its own code.
- **For everyone.** Plain language, accessible UI, one URL per language (`/` for English,
  `/pt/` for Portuguese).
- **Open core.** This repository is public under AGPL-3.0. Accounts, payments and server-side
  AI will live in a separate private repository.

## Quick start

Requirements: Node.js 24 (see `.nvmrc`) and pnpm 12 (pinned in `package.json`; with Corepack
or pnpm ≥ 10 the right version is used automatically).

```sh
pnpm install
pnpm dev          # http://localhost:4321 — the template tool is at /template-tool/
```

## Scripts

All scripts run from the repository root through Turborepo.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the site in development mode |
| `pnpm build` | Compile messages and build the static site to `apps/web/dist` |
| `pnpm lint` | Lint and check formatting with Biome (`pnpm lint:fix` to fix) |
| `pnpm format` | Format all files with Biome |
| `pnpm typecheck` | Type-check every package (`astro check` for the site) |
| `pnpm test` | Unit tests with Vitest |
| `pnpm test:e2e` | Playwright smoke tests on Chromium, Firefox and WebKit |

The first time you run e2e tests, install the browsers:
`pnpm --filter @mochifile/web exec playwright install`.

## Repository map

```
apps/web/                  Astro site (static output) with React islands
packages/tool-kit/         The Tool contract, worker wrapper and file helpers
packages/ui/               Shared React components and design tokens
packages/i18n/             Locales and Paraglide messages (en, pt)
packages/tools/_template/  Copy this to create a new tool
docs/                      Architecture, ADRs and contributor guides
.github/                   CI, CodeQL, issue and PR templates
```

Read [docs/architecture.md](docs/architecture.md) for how it fits together and
[docs/adr/](docs/adr/) for the decisions behind it.

## Contributing

Contributions are welcome — especially new tools and translations. Start with
[CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/contributing/adding-a-tool.md](docs/contributing/adding-a-tool.md). AI coding agents
follow [AGENTS.md](AGENTS.md).

Please report security issues privately: see [SECURITY.md](SECURITY.md).

## License

[GNU Affero General Public License v3.0](LICENSE). "Mochifile" and its logo are the project's
brand; see [ADR 0002](docs/adr/0002-product-name-and-brand-usage.md).
