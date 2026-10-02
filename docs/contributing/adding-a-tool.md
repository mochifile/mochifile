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

## The contract

Defined in [`packages/tool-kit/src/contract.ts`](../../packages/tool-kit/src/contract.ts).

| Part | File | Rules |
| --- | --- | --- |
| Manifest | `src/manifest.ts` | Plain data via `defineToolManifest()`: `id`, `category` (`image`, `media`, `pdf`), `runtime` (`browser`, `server`), `accepts` (MIME types), `limits`, `defaults`, and `meta` per locale (`slug`, `title` ≤ 70 chars, `description` ≤ 160 chars). Validated when imported. |
| Process | `src/process.ts` | `(files, options, { signal, onProgress }) => Promise<ToolResult[]>`. Pure: no DOM, no network, no logging of file data. Check `signal` with `throwIfAborted`. Throw `ToolError` for expected failures. |
| Worker | `src/worker.ts` | `exposeTool(defineTool(manifest, processFiles))`. Nothing else. |
| UI | `src/Ui.tsx` | Default export `({ locale }) => JSX`. Uses `createToolClient` to run the worker, `@mochifile/ui` components and Paraglide messages. |
| Messages | `messages/{en,pt}.json` | Keys prefixed with the tool id in snake_case (`compress_image_…`). |
| Tests | `src/*.test.ts` | Unit tests for `process()`: success, options, limits, abort. |

## What you get for free

- `validateFiles()` runs before and inside the worker, with error codes the UI can translate.
- Options are merged with `defaults`; progress is clamped to 0–1 and always delivered before
  the result; cancelling via `AbortSignal` reaches the worker.
- The page shell, `<title>`, description, canonical and `hreflang` links, the sitemap entry and
  the language switcher.
- Each tool page downloads only its own UI and worker code.

## Checklist before opening the PR

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass
- [ ] Tried it with `pnpm dev` in every locale, on a phone-sized screen
- [ ] An e2e smoke test in `apps/web/e2e/` if the tool has a notable flow
- [ ] Any new dependency is justified in the PR description
