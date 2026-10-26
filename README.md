<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/design-system/assets/Logos/mochifile-wordmark-dark.png">
  <img src="docs/design-system/assets/Logos/mochifile-wordmark-light.png" alt="Mochifile" width="280">
</picture>

**Make it fit.**

Simple, private file tools that run in your browser.

[mochifile.com](https://mochifile.com) · [Compress an image](https://mochifile.com/compress-image/) · [Contribute](CONTRIBUTING.md)

> **Status:** pre-launch. The site is live with one tool and more are in development. It stays
> out of search engines until launch ([ADR 0014](docs/adr/0014-block-search-indexing-until-launch.md)).

---

## What is Mochifile?

Mochifile is for the moment a form says "photo must be under 50 KB" and you just want it to
work. You choose a tool, add your files and download the result. No account, no installing
anything, and, because the work happens in your browser, your files stay on your device.

Today there is one tool: [Compress image to a target size](https://mochifile.com/compress-image/).
It shrinks JPG, PNG and WebP photos to the limit you pick, from 5 KB to 20 MB. The site is in
English and Portuguese.

## Principles

- **Private by design.** Tools run in your browser, in Web Workers, whenever possible. Files
  are not uploaded when a browser path exists, and file contents and names are never logged
  ([ADR 0006](docs/adr/0006-client-side-processing-first.md),
  [ADR 0009](docs/adr/0009-privacy-by-design.md)).
- **Useful for everyone.** Plain words, big targets, clear errors. Every page exists in every
  language, each with its own URL ([ADR 0007](docs/adr/0007-i18n-per-locale-urls.md)).
- **Open source.** This repository is AGPL-3.0. Accounts, payments and server-side AI would
  live in a separate private repository, never here ([ADR 0003](docs/adr/0003-open-core-licensing.md)).
- **Honest.** Claims are checked, not just made: a strict Content-Security-Policy limits the
  page to its own origin ([ADR 0012](docs/adr/0012-content-security-policy.md)), and the
  end-to-end tests fail on any policy violation or console error.

## Documentation

- [Development setup](CONTRIBUTING.md#development-setup): clone, install, run, and open a pull request
- [Architecture](docs/architecture.md): how the site, the tools and the packages fit together
- [Design System](docs/design-system/README.md): colours, type, components, logo and mascot
- [Adding a tool](docs/contributing/adding-a-tool.md): the tool contract, step by step
- [Translations](docs/contributing/i18n.md): how strings, page copy and locales work
- [Testing](docs/contributing/testing.md): unit and end-to-end tests
- [Deployment](docs/contributing/deployment.md): previews, production and Cloudflare
- [Decisions](docs/adr/README.md): the architecture decision records
- [AGENTS.md](AGENTS.md): the rules, for people and for AI coding agents

## Development

You need Node.js 24 (see `.nvmrc`) and pnpm 12.

```sh
pnpm install
pnpm dev          # http://localhost:4321
```

Before you push, run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, and
`pnpm test:e2e` if you touched pages or a tool's UI (the first run needs
`pnpm --filter @mochifile/web exec playwright install`). All commands are in
[AGENTS.md](AGENTS.md#commands).

## Contributing

New tools, translations, fixes and docs are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md),
and please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Have a tool in mind? Open a
[tool proposal](https://github.com/mochifile/mochifile/issues/new?template=new-tool.yml) before
you write code.

Found a security issue? Please do not open a public issue: write to
**security@mochifile.com** ([SECURITY.md](SECURITY.md)).

## License

[GNU Affero General Public License v3.0](LICENSE). The name and logo identify the official
project: forks are welcome, but must not present themselves as the official Mochifile
([ADR 0002](docs/adr/0002-product-name-and-brand-usage.md)).
