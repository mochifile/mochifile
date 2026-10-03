# Adding a tool

A Mochifile tool is a small package in `packages/tools/<tool-id>/`. The site discovers it
automatically and generates its pages, routes, sitemap entries and SEO tags in every locale.
The step-by-step instructions live with the code, in
[`packages/tools/_template/README.md`](../../packages/tools/_template/README.md).

## Before writing code

1. Open a [new tool proposal](https://github.com/mochifile/mochifile/issues/new?template=new-tool.yml).
2. Check it can run **in the browser**. If it needs a WebAssembly engine, name it and its
   license (it must be compatible with AGPL-3.0). If it truly needs a server, it belongs to
   the private cloud repository and needs an ADR.
3. Pick an `id` and a slug per locale. Slugs are what people search for:
   `compress-image`, `comprimir-imagem`.
4. Decide whether common needs deserve their own page (a **variant**, e.g. "compress image to
   50 KB"). Only add one if you can write genuinely useful copy for it.

## The contract

Defined in [`packages/tool-kit/src/contract.ts`](../../packages/tool-kit/src/contract.ts).

| Part | File | Rules |
| --- | --- | --- |
| Manifest | `src/manifest.ts` | Plain data via `defineToolManifest()`: `id`, `category` (`image`, `media`, `pdf`), `runtime` (`browser`, `server`), `accepts` (MIME types), `limits`, `defaults`, `meta` per locale (`slug`, `title` ≤ 70 chars, `description` ≤ 160 chars) optional `variants` (`key`, preset `options`, `meta` per locale) and optional `relatedPagesLabel` per locale (heading above the links between the tool's pages, ≤ 40 chars; defaults to "Popular options"). Validated when imported. |
| Process | `src/process.ts` | `(files, options, { signal, onProgress }) => Promise<ToolResult[]>`. Pure: no DOM, no network, no logging of file data. Check `signal` with `throwIfAborted`. Throw `ToolError` for expected failures. |
| Worker | `src/worker.ts` | `exposeTool(defineTool(manifest, processFiles, { prepare }))`. `prepare` is optional: it loads what `process()` needs (e.g. WebAssembly) before the user picks a file. Nothing else. |
| UI | `src/Ui.tsx` | Default export `({ locale, initialOptions }) => JSX`. `initialOptions` are a variant's options, as untyped data: narrow them. Uses `createToolClient` to run the worker (call `client.prepare()` on the first sign of intent if the tool has a `prepare` hook), `@mochifile/ui` components and Paraglide messages. |
| Messages | `messages/{en,pt}.json` | Short UI strings. Keys prefixed with the tool id in snake_case (`compress_image_…`). |
| Page copy | `content/<locale>/<key>.md` | Long-form copy for each page: `index.md` for the main page, `<variant key>.md` per variant, in every locale. Start with `##` headings (the page already has the `h1`). The build fails if one is missing. See [ADR 0018](../adr/0018-tool-variants-and-markdown-page-copy.md). |
| Tests | `src/*.test.ts` | Unit tests for `process()`: success, options, limits, abort. |

## What you get for free

- `validateFiles()` runs before and inside the worker, with error codes the UI can translate.
- Options are merged with `defaults`; progress is clamped to 0–1 and always delivered before
  the result; cancelling via `AbortSignal` reaches the worker.
- The page shell, `<title>`, description, canonical and `hreflang` links, breadcrumbs,
  `WebApplication` + `BreadcrumbList` structured data, the sitemap entry (with alternates) and
  the language switcher, for the main page and every variant.
- Links between a tool's pages, and variant shortcuts on the home page.
- Each tool page downloads only its own UI and worker code.

## Checklist before opening the PR

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass
- [ ] Tried it with `pnpm dev` in every locale, on a phone-sized screen
- [ ] An e2e smoke test in `apps/web/e2e/` if the tool has a notable flow
- [ ] Any new dependency is justified in the PR description
