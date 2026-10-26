# Proposed implementation roadmap

**Status: Proposed. Non-normative.** See [`README.md`](README.md). No PR below is approved; each
starts only when the maintainer asks for it. Order and scope may change.

Every PR follows AGENTS.md: its own branch, Conventional Commits,
`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, and `pnpm test:e2e` when it touches
pages or a tool's UI. New text exists in English and Portuguese. None touches
`ALLOW_SEARCH_INDEXING`, the CSP, `wrangler.jsonc` domains or unlaunched tools.

| # | PR | Depends on |
| --- | --- | --- |
| 1 | `docs(design-system)`: this proposal | none |
| 2 | `feat(web)`: header, "Skip to content", phone menu (implementation chosen by a tested prototype) | PR 1; the menu decision |
| 3 | `feat(web)`: footer (licenses link, "a Mochifile", groups from the registry) | PR 1 |
| 4 | `feat(web)`: home (presets and tools from manifests; decorative "MB → KB"; honest copy) | PR 2, 3; open home decisions |
| 5 | `feat(web)`: static part of the tool page (hero steps, two columns, FAQ) | PR 1 |
| 6 | `feat(tool-ui)`: "compressor did not load" with retry; remove a file; continue after cancel; batch summary. No confirmation button | PR 1 |
| 7 | `feat(tool-ui)`: file name, result banner, indeterminate bar, state block, result row | PR 1, 6 |
| 8 | `feat(tool-ui)`: phone option list and `tool-reserve` recalibration | PR 1 |
| 9 | `feat(compress-image)`: panel and result copy | PR 6, 7, 8 |
| 10 | `fix(web)`: localized 404 (English and Portuguese messages, `pt/404.astro`; confirm Cloudflare's behavior in the preview) | PR 2, 3 |
| 11 | `feat(web)`: About and Help (new routes only with approved slugs; only confirmed contacts) | PR 2, 3 |
| 12 | `feat(web)`: Open Graph tags and images | the production-method decision |
| 13 | Launch validation: axe on every page in both themes, Lighthouse (ADR 0021 method), real devices, 200% zoom | PR 2 to 12 |

After their triggers: legal pages (legal review), Converter image with the new patterns,
Tools menu and "Most used" block (2+ live tools), category pages (2+ tools in the category),
search and start-from-file (each with an ADR).

## Dependencies on PR #25 (Convert image)

PR #25 stays open until its functional review is complete and is independent of this
proposal. The registry publishes any manifest automatically, so merging #25 would publish the
tool and satisfy the "2+ tools" triggers.

| File touched by #25 | Redesign PR affected | Rule |
| --- | --- | --- |
| `apps/web/src/components/HomePage.astro` | 4 | Whoever merges second rebases. The new home must work with one tool and with several |
| `packages/tool-ui/src/ResultRow.tsx` | 7 | Do not reshape the size-summary API before #25 is decided |
| `packages/tool-ui/src/format-size.ts`, `compress-image/src/sizes.ts` | 6, 7, 9 | The redesign does not move `formatSize` |
| `packages/i18n/project.inlang/settings.json` | any PR adding messages | Trivial conflict |
| `apps/web/e2e/budget.ts` | 2, 4 | Reuse it if #25 lands first |
| `apps/web/src/lib/tools.ts` registry | 2, 3, 4, 12 | Derive everything from the registry; no PR hides or adds a tool |

## What would need an ADR

- A JavaScript exception to AGENTS.md rule 5 (search, or a scripted menu).
- Start-from-file: how a file reaches the tool without leaving the device.
- A change to the engine's "never above the target" guarantee (ADR 0017).
- Content pages outside tool pages, if they need a decision beyond ADR 0018.

Purely visual decisions do not need an ADR; they are recorded in the Design System.

## Acceptance checks for this documentation PR

- Documentation only; no application code, tokens, manifests or ADRs change.
- No document claims final visual approval; status is Proposed everywhere.
- Corrections in [`discrepancies.md`](discrepancies.md) are present.
- Every off-scale value has a destination or is marked pending.
- No new URL is presented as published; About and Help slugs are pending.
- `reference/` is not committed.
