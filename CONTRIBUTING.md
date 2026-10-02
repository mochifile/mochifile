# Contributing to Mochifile

Thanks for your interest! Mochifile is a collection of simple, private file tools for
everyone. New tools, translations, bug fixes and docs are all welcome.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- **Bugs and small fixes:** open a PR directly, or an issue if you are unsure.
- **New tools:** open a [new tool proposal](https://github.com/mochifile/mochifile/issues/new?template=new-tool.yml)
  first, so we can agree on scope and engine before you write code.
- **Bigger changes** (architecture, dependencies, new services): open an issue and, if agreed,
  write an ADR in [`docs/adr/`](docs/adr/).
- **Security issues:** never in public — see [SECURITY.md](SECURITY.md).

## Development setup

1. Install Node.js 24 (`.nvmrc`) and enable Corepack (`corepack enable`) or install pnpm 12.
2. Fork and clone the repository, then:

   ```sh
   pnpm install
   pnpm dev
   ```

3. Create a branch from `main`: `feat/compress-image`, `fix/pt-typo`, `docs/adr-0013`…

See the [README](README.md#scripts) for all scripts.

## Making a change

- Follow the conventions and rules in [AGENTS.md](AGENTS.md) — they apply to humans too.
- Keep PRs small and focused. One logical change per commit.
- Write commits and the PR title as [Conventional Commits](https://www.conventionalcommits.org):
  `feat(tools): add heic to jpg converter`, `fix(web): correct pt hreflang`.
- Add or update tests. Run before pushing:

  ```sh
  pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
  ```

- Every user-facing string must exist in every locale. If you cannot translate, leave the
  English text in the other locale files and say so in the PR — a maintainer will help.
- Adding a dependency? Explain why in the PR (purpose, size, license, maintenance) and pin the
  exact latest version.

## Guides

- [Adding a tool](docs/contributing/adding-a-tool.md)
- [Translations and i18n](docs/contributing/i18n.md)
- [Testing](docs/contributing/testing.md)
- [Architecture](docs/architecture.md) and [decision records](docs/adr/)

## Review

A maintainer reviews every PR (see [`.github/CODEOWNERS`](.github/CODEOWNERS)). CI must pass:
lint, typecheck, unit tests, build, Playwright on Chromium/Firefox/WebKit, and CodeQL.

## License

By contributing, you agree that your contributions are licensed under the
[AGPL-3.0](LICENSE), the license of this repository.
