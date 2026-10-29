# 0034. Keep page data out of tool islands, and declare the internal packages side-effect free

- **Status:** Proposed
- **Date:** 2026-10-29

## Context

Issue #84. The e2e test `compress-image.spec.ts › loading › waits for intent on Save-Data, and
stays small before it` limits the JavaScript sent before any interaction on the compressor's page
to 90 KiB, 92,160 bytes gzip. After #83 the margin was **349 bytes** by the test's own method, and
the next tool, Convert image V2, was still to come.

**Why two series of measurements disagreed by about 3.1 KB (ADR 0033).** The e2e server builds the
site with `MOCHIFILE_INCLUDE_TEMPLATE=true` (`playwright.config.ts`): the template tool is part of
that build, so there are **two tools**, and the production build has one. `ToolIsland` loads each
tool's `Ui.tsx` lazily, so each tool is a chunk of its own, and what two tools both import goes
into a shared chunk that both pages download before anything is touched. With one tool nothing is
shared and everything is inlined in the tool's chunk, where what is not used is removed. The
official test (91,811 bytes before this change) therefore measures the **production build with a
second tool**: the closest thing to what production becomes when Convert image ships, with the
caveat that the template stands in for that tool, and uses more of `@mochifile/ui` than a V2 panel
does (see the table). The author's script, which built without the variable, measured today's
production build (88,622). The two series were both right, of different builds: the chunks that
differ are `src`, `jsx-runtime` and the split of `Ui`. Of the three earlier readings of `main` at
`71f6e27` in ADR 0033, 91,180 is the official build and 88,004 the production one; **85,028
remains unexplained**. Builds of one commit and one configuration gave the same bytes every time
(91,811 was measured here and by the independent review; 88,622 twice).

Where the bytes were, by source module (sourcemaps of the official build, bytes of the minified
output attributed to their original file, gzip estimated in proportion), for the compressor's page:

| Where | gzip ≈ | What |
| --- | --- | --- |
| `Ui` chunk | 6.4 KB | the compressor panel's own code |
| `Ui` chunk | 1.1 KB | **the pages' data in `manifest.ts`**: titles, descriptions and taglines of every variant, in both languages |
| `src` chunk, shared | 0.9 KB | **`defineToolManifest` and its validation**, running in the browser |
| `src` chunk, shared | 2.9 KB | `Mascot`, `Dropzone`, `SizeChips`, `Notice` and `Button` of `@mochifile/ui` **that the compressor does not use**; the template does |
| `src` chunk, shared | 1.5 KB | `comlink` (the worker's RPC) |
| `src` chunk, shared | 0.9 KB | Paraglide's runtime |

## Options considered

1. **A per-tool config, `sideEffects` flags (chosen).** Described below.
2. **Messages of the page's language only.** Every page ships both languages (a message function
   holds EN and PT): the compressor's messages are about 3.3 KB gzip, so about 1.6 KB is the other
   language. It needs the locale to be known when the island is built or loaded (a chunk per
   language behind a dynamic `import()`, or the strings passed as props by the page), and either
   way a first-render dependency or a change in how all of the 100+ calls read. Not needed for the
   target; kept as the next lever.
3. **`comlink` on demand** (1.5 KB). The worker is only reached after the first intent, so it
   could be loaded with it. But a failed dynamic `import()` is kept by Chromium until the page is
   reloaded (ADR 0033: measured), and the "compressor did not load, try again" path would then
   never work for a transient failure; the worker, today, is created again on each try. A gain of
   1.5 KB does not justify making that fragile.
4. **Move rarely used states** (cancelled, "too many", the ZIP failure notice) to a chunk loaded on
   intent. The failure notice must still appear when the chunk that failed is the one that holds it
   (ADR 0033, `compress-image-zip-failures.spec.ts`), which needs an eager fallback. Not needed for
   the target.
5. **Raising the 90 KiB limit.** Rejected: it hides the problem and moves it to the visitor.

## Decision

1. **A tool's UI imports its `config.ts`, never its `manifest.ts`.** `config.ts` holds what the UI
   and the worker need at run time: `accepts`, `limits`, `defaults` (typed `ToolRuntimeConfig`) and
   the options type. `manifest.ts` is built from it (`...config`), so there is one source, and keeps
   what only the pages need. `createToolClient` takes the config (a `ToolManifest` still fits it).
   `defineToolManifest` and its validation now run in the pages, the registry and the tests, and
   no longer in the browser.
2. **`@mochifile/ui`, `@mochifile/tool-ui` and `@mochifile/tool-kit` declare `"sideEffects":
   false`** (`**/*.css` excepted for the UI package). A tool's chunk then only draws in the modules
   it uses, and the shared chunk of two tools holds what both use, not what either could reach
   through a barrel. They have no code that runs on import; the flag says so and must stay true.
3. **A test keeps it that way** (`apps/web/src/lib/tool-islands.test.ts`): no `Ui.tsx` imports a
   value from `./manifest.ts`, every tool with a UI has a `config.ts`, and its manifest agrees with
   it. A rule checked only by reading would not survive the next tool; the pattern it checks is
   tested with the multi-line, semicolon-free imports this code has.
4. The template tool, the guide (`docs/contributing/adding-a-tool.md`) and `AGENTS.md` show the
   pattern, because Convert image will start from them.

## Measurements

Method: the e2e test's own (Chromium, Save-Data, every `.js` response, `gzipSync` of its body, after
the file input and 3 s), run on production builds rebuilt for each column from the same commit's
parent (`main` at `2798bdb`) and from this change, same machine, same script; EN and PT pages give
the same bytes. "Official" is the e2e build (two tools); "production" is the build without the
template, which is what is deployed today.

| | `main` | This change | Change | Margin to 92,160 |
| --- | --- | --- | --- | --- |
| Official (two tools), before interaction | 91,811 | **87,360** | **−4,451** | 349 → **4,800** |
| Production (one tool), before interaction | 88,622 | **86,688** | −1,934 | 3,538 → **5,472** |
| After the first intent (worker, WebAssembly, ZIP code) | +42,049 in 4 scripts, 4 `.wasm`, 8 requests | +42,059 in 4 scripts, 4 `.wasm`, 8 requests | +10 | |

The +10 bytes are the compressor's worker, which still imports its whole manifest. Nothing was
added after interaction, and no request was added before it. With only the `sideEffects` flags the
official figure was 89,295 (−2,516); the config split took the other 1,935.

What is left in the official build before interaction: React's client 65.8 KB; the shared chunk
3.8 KB (`comlink` 1.6, Paraglide's runtime 1.0, `tool-kit` files and client 0.9, errors and the rest
0.3); the compressor's `Ui` 13.1 KB; `react` 3.0, `preload-helper` 0.8, `ToolIsland` 0.5,
`jsx-runtime` 0.3.

## Consequences

- **The margin is 4,800 bytes by the official method (5,472 in production), 4,451 more than
  before.** The target of the issue was at least 4,096. Sizing for Convert image V2: the pull
  request #25 has 39 messages (about 0.7 KB gzip per language) and a 300-line UI of the old panel;
  the compressor V2 has 104 messages (1.7 KB) and 1,400 lines. A V2 panel of the compressor's
  weight puts Convert's `Ui` chunk at about the compressor's 13 KB, and so its page at about this
  one's; a page that is 4.8 KB heavier would be over. That is what the margin is for: it is
  adequate, not generous.
- **The official test measures one page.** It does not see a tool whose page is heavier than the
  compressor's. When Convert image ships its page needs the same assertion (the test could be
  driven by the registry, one page per tool); not done here, and the limit was not changed.
- **A new tool pays for what it imports, not for what other tools do.** That is what the flags
  and the guard are for; the figures above are the proof for the one pair that exists.
- **`sideEffects: false` is a promise.** A module that registers something on import, in those
  three packages, would be dropped when nothing it exports is used. Keep top levels free of it.
- **Not measured:** Firefox and WebKit before interaction (the test is Chromium-only: it needs
  `navigator.connection`), a slow device, and Convert image itself.
- **Not done, and the next levers if the margin is needed again:** the other language's messages
  (about 1.6 KB), `comlink` on demand (1.5 KB, with the failed-import caveat), the compressor's
  rarely used states, and the pages' text still imported by the worker (outside the budget).
