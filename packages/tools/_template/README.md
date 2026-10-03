# Tool template

A minimal, working Mochifile tool: it changes the case of a plain-text file. Copy it to start
a new tool. It is visible in development at `/template-tool/` and `/pt/ferramenta-modelo/`,
and is never included in production builds.

```
_template/
├── messages/{en,pt}.json  UI text, compiled by Paraglide
├── content/{en,pt}/*.md   long-form copy per page: index.md + one per variant
├── src/manifest.ts        id, category, accepted types, limits, defaults, SEO metadata
├── src/process.ts         the pure processing function (runs in a Web Worker)
├── src/process.test.ts    unit tests for process()
├── src/worker.ts          worker entry: wires manifest + process
├── src/Ui.tsx             React UI (the page's only island)
└── package.json
```

## Create a new tool, step by step

Throughout, replace `compress-image` with your tool id (lowercase kebab-case).

1. **Copy the folder**

   ```sh
   cp -R packages/tools/_template packages/tools/compress-image
   ```

2. **Rename the package** in `package.json`: `"name": "@mochifile/tool-compress-image"`, and
   update the description. Then run `pnpm install`.

3. **Write the manifest** (`src/manifest.ts`):
   - rename `TemplateOptions` and define your options (plain data only);
   - set `id`, `category`, `runtime: 'browser'`, `accepts` (e.g. `['image/jpeg', 'image/png']`),
     `limits` and `defaults`;
   - write `meta` for every locale: the `slug` people would search for, a `title`
     (≤ 70 characters) and a `description` (≤ 160 characters).
   - optionally add `variants`: extra pages with preset options (e.g. a target size), each
     with its own `key`, `options` and `meta`. The template's `lowercase` variant is an
     example; remove it if you have none.
   The manifest is validated as soon as it is imported; errors list every problem.

4. **Implement `src/process.ts`.** Keep it pure: read the `File`s, do the work, return
   `ToolResult`s (`{ file: Blob, name, meta? }`). Call `throwIfAborted(signal)` between steps
   and `onProgress({ ratio })` as you go. Throw `ToolError` with a code for expected failures.
   Use `renameFile()` for output names. Heavy engines (WebAssembly) are imported here, never
   from the manifest or UI.

5. **Write tests** in `src/process.test.ts`: success, each option, limits, abort.

6. **Messages:** rename the keys in `messages/en.json` and `messages/pt.json` to your prefix
   (`compress_image_…`), translate them, and add your folder to `pathPattern` in
   `packages/i18n/project.inlang/settings.json`:

   ```json
   "pathPattern": [
     "./messages/{locale}.json",
     "../tools/_template/messages/{locale}.json",
     "../tools/compress-image/messages/{locale}.json"
   ]
   ```

7. **Build the UI** in `src/Ui.tsx`: update the message keys and add your options, starting
   from `initialOptions` on variant pages (see `initialMode()`). Use components from
   `@mochifile/ui` and semantic Tailwind tokens; no inline styles.

   **Write the page copy** in `content/<locale>/index.md` and `content/<locale>/<variant>.md`
   for every locale: start with `##` headings; cover how it works, privacy, tips and a short
   FAQ. Plain, friendly sentences; no keyword stuffing.

8. **Leave `src/worker.ts` as is** (only the import names change if you renamed them).

9. **Check everything:**

   ```sh
   pnpm dev                     # open /compress-image/ and /pt/<slug>/
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```

   Pages, routes, sitemap and `hreflang` are generated automatically.

10. **Open a PR** titled `feat(tools): add compress-image`, and fill in the checklist.

See [docs/contributing/adding-a-tool.md](../../../docs/contributing/adding-a-tool.md) for the
contract in detail and [AGENTS.md](../../../AGENTS.md) for the rules.
