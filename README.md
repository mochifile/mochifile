<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/design-system/assets/Logos/mochifile-wordmark-dark.png">
    <img src="docs/design-system/assets/Logos/mochifile-wordmark-light.png" alt="Mochifile" width="200">
  </picture>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/mochifile/mochifile?style=flat-square&labelColor=1e1b2e&color=9b7bea" alt="License: AGPL-3.0"></a>
  <a href="https://github.com/mochifile/mochifile/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mochifile/mochifile/ci.yml?branch=main&label=ci&style=flat-square&labelColor=1e1b2e" alt="CI status"></a>
  <img src="https://img.shields.io/badge/language-TypeScript-9b7bea?style=flat-square&labelColor=1e1b2e" alt="Language: TypeScript">
</p>

<p align="center">
  Simple, private file tools that run in your browser.
</p>

<p align="center">
  <a href="https://mochifile.com">Website</a> · <a href="https://mochifile.com/compress-image/">Compress an image</a> · <a href="CONTRIBUTING.md">Contribute</a>
</p>

<br>

A form says the photo must be under 50 KB. Add your file, choose a size, download the result. It all happens in your browser, so your files stay on your device.

Today there is one tool, [Compress an image](https://mochifile.com/compress-image/), in English and Portuguese. Mochifile is pre-launch: the site is live, but it stays out of search engines until launch.

#### documentation

<pre>
00 <a href="CONTRIBUTING.md#development-setup">setup</a> ····· run it locally
01 <a href="docs/architecture.md">architecture</a> ···· overview
02 <a href="docs/design-system/README.md">design</a> ··· visual language
03 <a href="docs/contributing/adding-a-tool.md">tools</a> ········· add a tool
04 <a href="docs/adr/README.md">decisions</a> ··········· ADRs
05 <a href="CONTRIBUTING.md">contribute</a> ··· how to help
06 <a href="SECURITY.md">security</a> ··· how to report
</pre>

#### development

```sh
pnpm install
pnpm dev
```

Needs Node.js 24 and pnpm 12. The checks to run before a pull request are in [AGENTS.md](AGENTS.md#commands).

#### contributing

New tools, translations and fixes are welcome. Open a [tool proposal](https://github.com/mochifile/mochifile/issues/new?template=new-tool.yml) before writing a new tool, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security issue? Do not open a public issue: write to **security@mochifile.com**.

#### license

[AGPL-3.0](LICENSE). The name and logo identify the official project: forks are welcome, but must not present themselves as the official Mochifile ([ADR 0002](docs/adr/0002-product-name-and-brand-usage.md)).
