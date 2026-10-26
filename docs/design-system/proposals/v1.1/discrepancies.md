# Design-to-code discrepancies

**Status: Proposed. Non-normative.** See [`README.md`](README.md). Statements marked
*Existing behavior* were verified in the repository at the commit this proposal was written
against; the source is named.

## Existing technical behavior

| Topic | Behavior | Source |
| --- | --- | --- |
| Accepted inputs | JPG, PNG, WebP (by type, or by extension when the browser gives none). HEIC and AVIF are refused in Compress image | `compress-image/src/manifest.ts`, `tool-kit/src/files.ts` |
| Output formats | Same as original (PNG may become JPG if it cannot fit), JPG, WebP | `engine-image/src/compress.ts` |
| Targets | Presets 20, 50, 100, 200, 500 KB and **1 MB**; custom 5 KB to 20 MB; 1 KB = 1,000 bytes | `sizes.ts`, ADR 0017 |
| Default | 100 KB, same as original | manifest |
| Guarantee | The result is never above the target; otherwise `target-unreachable` with the smallest size reached | `compress.ts`, `fit-to-size.ts` |
| Resizing | Automatic only; the person cannot choose dimensions | `compress.ts` |
| Reasons an image shrinks | (1) Memory: work is capped at 16 MP (`MAX_WORKING_PIXELS`) even if the photo could fit. (2) Target: if the minimum quality (40) is still too big, the image shrinks, never below 64 px on its longest side. `resized` does not say which reason applied | `compress.ts`, `fit-to-size.ts` |
| Pixel limits | Over 100 MP is refused before decoding, on every path. On the WebAssembly decode path (used when canvas readback is noisy: private Safari, Brave, Firefox with resistFingerprinting) the limit is **24 MP**. Native paths accept up to 100 MP | `MAX_INPUT_PIXELS`, `WASM_MAX_PIXELS` |
| Metadata | Always removed (EXIF including GPS, XMP, text); only a minimal orientation block may remain | `strip-metadata.ts` |
| Already fits | Same format and at or under the target: same pixels, no re-encoding, metadata removed. With a different requested format the image is converted instead | `compress.ts` |
| Transparency | JPG flattens onto white (`flattenedTransparency`); the UI offers "Keep transparency (WebP)" | `compress.ts`, `Ui.tsx` |
| Batch | Up to 20 files, 50 MB each, no total limit; processed one at a time; starts when files are added | manifest, `use-file-queue.ts` |
| Cancel | `AbortSignal` reaches the worker; queued files become cancelled; finished results stay | `use-file-queue.ts`, worker |
| Errors | `ToolError` codes mapped to messages; unexpected errors become `processing-failed` | `tool-kit/src/errors.ts`, `tool-ui/error-message.ts` |
| Network | The engine loads on first intent or when idle (not on Save-Data or 2G); nothing is fetched after a file is chosen | `use-prepare-on-intent.ts`, `preload-policy.ts`, e2e |
| Failed preparation | Silently returns to `idle` and retries on the next intent; the UI cannot tell "failed" from "not started" | `use-prepare-on-intent.ts` |
| Variants | Six: `20kb`, `50kb`, `100kb`, `200kb`, `500kb`, `1mb`, in both locales | manifest |
| Header | Logo plus a link per locale; no menu | `BaseLayout.astro` |
| Footer | Logo, privacy note, GitHub link, "Open-source licenses" link | `BaseLayout.astro` |
| 404 | One page with English text hard-coded; `noindex`; no language suggestion | `pages/404.astro` |
| Open Graph | Basic `og:` tags; no `og:image`, `twitter:card` or `og:locale:alternate` | `BaseLayout.astro` |
| Hosting | Cloudflare Workers with static assets only; unknown paths get `404.html` | `wrangler.jsonc`, ADR 0013 |
| Registry | Every `manifest.ts` is published automatically (the template tool only in dev and e2e) | `apps/web/src/lib/tools.ts` |

## Corrections to the launch specification

| Specification says | Verified | Consequence |
| --- | --- | --- |
| Five variants; "1 MB does not exist as a page" | Six variants including 1 MB | "Other sizes" and presets come from the manifest |
| Share images: home plus 6 pages × 2 locales | Home plus 7 tool pages = 8 pages per locale, **16** images | The 404 has none. Converter (PR #25) would add 14 when published; About and Help add 4 |
| "Up to 100 megapixels" | 100 MP on native paths; 24 MP on the WebAssembly path | Copy must not promise 100 MP everywhere |
| "To fit, we also shrank the photo" | The image may also shrink because of the 16 MP memory cap | Proposed neutral copy: "We also made the photo smaller: from A × B to C × D pixels" |
| "Download at 61 KB" for an impossible target | The engine never returns a file above the target | **Not proposed.** Offer "Try {next size}" and "Other size" |
| Contacts: hello@, security@, dev@, conduct@ | Only security@ (SECURITY.md) and conduct@ (CODE_OF_CONDUCT.md) appear in the repository. None is verified as deliverable | Publish only addresses the maintainer confirms |
| Footer line without the licenses link | The link is required (third-party notices) | Keep "Open-source licenses" |
| Hero text longer than 60 characters | ADR 0020 limits `meta.tagline` to 60 characters, per locale, from the manifest | Keep the manifest tagline |
| Logo `aria-label` "Mochifile, home page" | ADR 0020 and the e2e test require exactly "Mochifile" | Keep "Mochifile" |
| Upload-arrow icon on "Choose photos" | The brand promises files are not uploaded | No upload iconography |
| Two-level breadcrumb on phones | ADR 0020 shows only the parent level under 600 px | Keep current behavior unless the ADR is revised |
| Portuguese footer message says "O Mochifile é open source" (`footer_open_source`) | Decision: "a Mochifile" in Brazilian Portuguese | Fix in the footer PR |
| Server error page | Static-assets hosting has no configurable 5xx page | Propose archiving that artboard |
| `mochifile.css` is "tokens v2 from tokens.json" | `tokens.json` is v1 | Do not use it as a token source |

## Panel states: feasibility

- **Supported now (style and copy only):** empty, dragging, wrong file, too large, damaged,
  already fits, changed format, transparency lost, resized, no JavaScript.
- **Needs UI or `tool-ui` work:** preparing (an indeterminate bar), batch summary and counts,
  cancelled with "Continue", removing a file from the list, "compressor did not load" with
  "Try again".
- **Not supported; not proposed:**
  - Downloading a result above the target ("Download at 61 KB"). It would change the engine
    contract and ADR 0017.
  - A "Compress N photos" confirmation. Decided against: processing stays automatic.
  - "Browser not supported" and "you are offline". No detection exists. All that can be known
    is that the compressor did not load, and the message must say only that.
  - Explaining why a file is damaged. Say it could not be opened.
- **Unresolved:** what "Change options" does after processing, and what the "Other…" custom
  size looks like (no artboard).

## Conflicts with Design System v1 and ADRs

| Conflict | Source | Handling |
| --- | --- | --- |
| Home without search and without a Premium block | v1 README, Page patterns › Home | Launch home differs from the v1 pattern; update only when accepted |
| Looping indeterminate bar, chevron rotation, hover fills | v1 README, Motion ("never loop decoration") | Needs an explicit motion rule or removal |
| Off-scale type, space and radius | ADR 0020, design guard | See [`additions.md`](additions.md) |
| 18 px button labels | `label-lg` is 20 px | Pending visual |
| About and Help pages as Markdown | ADR 0018 covers tool pages only | Would need a decision when those pages are built |
| Menu that needs JavaScript (Escape) | AGENTS.md rule 5 | Preferred candidate needs no JavaScript; see [`additions.md`](additions.md) |
| Search and start-from-file | AGENTS.md rule 5, ADR 0009 | Disabled; each needs an ADR |
| Legal pages with placeholders | ADR 0009, ADR 0022 | Do not publish until reviewed |
