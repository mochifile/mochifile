# 0004. Monorepo with pnpm workspaces and Turborepo

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The project consists of a site, a tool contract, shared UI, i18n and many small tool packages
that change together. Contributors should be able to clone once, install once and run every
check with one command.

## Decision

- Use a single repository with **pnpm workspaces** (`apps/*`, `packages/*`, `packages/tools/*`).
- Use **Turborepo** to run `build`, `typecheck`, `test` and `test:e2e` across packages with
  dependency ordering and caching. Lint/format run once at the root with Biome.
- Shared dependency versions live in the pnpm **catalog**; all versions are pinned exactly
  (`save-exact`), with Renovate proposing updates.
- Internal packages are **source-only** (exports point at TypeScript) — no per-package build.
- Use **TypeScript strict** everywhere, a shared `tsconfig.base.json`, **Biome** for lint and
  format, **Vitest** for unit tests and **Playwright** for e2e.
- Pin Node.js to the active LTS line (24) via `.nvmrc` and `engines`, and pnpm via
  `packageManager`.

## Consequences

- One lockfile, atomic cross-package changes, one CI pipeline.
- pnpm's strict `node_modules` catches undeclared dependencies.
- Packages that must be published to npm later will need a build step.
- TypeScript is held at 6.x until `@astrojs/check` supports TypeScript 7.
