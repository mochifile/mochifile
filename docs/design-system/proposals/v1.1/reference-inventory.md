# Design reference inventory

**Status: Proposed. Non-normative.** See [`README.md`](README.md).

This inventories the "Bloco e cartão" design reference, round 4 (2026-10-25), exported from
Claude Design. The export is **not** part of the repository: it lives in an untracked local
`reference/` folder and must not be committed. It is a design prototype, not source code, and
nothing in it may be copied into the app as is.

The reference holds 170 files (about 29 MB):

- `spec/especificacao-lancamento.md`: the launch specification, in Brazilian Portuguese, plus
  `spec/mapa-do-site.png` (site map by status).
- `artboards/`: 53 `.dc.html` canvas sources, `canvas.json` (positions and titles) and
  `mochifile.css` (token values used by the canvas).
- `screenshots/`: one PNG per artboard in light (53) and dark (49) themes, plus 8 phone-fold
  captures (360 × 800 and 390 × 844, both themes). Direction, OgImages, Sitemap and
  ToolInventory have no dark capture.

## Precedence

1. The repository: AGENTS.md, Design System v1, ADRs, tool manifests and messages.
2. The launch specification.
3. The artboards and screenshots.

## Caveats about the material

- Artboards use inline styles throughout (forbidden by the CSP), reference logos and the
  mascot through `/_blob/…` paths that are not included, and build menu "buttons" from links
  between artboards.
- Screenshots were rendered in Chromium only, with a local re-implementation of the canvas
  format and the repository's font subsets. They were not checked in Firefox, Safari, on real
  phones, with a screen reader or at 200% zoom.
- `canvas.json` puts every artboard except four on a page called "launch". That page name does
  **not** mean the artboard is a launch screen. Use the status below.
- `mochifile.css` calls itself "tokens v2, copied 1:1 from tokens.json". `tokens.json` is v1
  and has neither `surface-code` nor `scrim`; do not treat that file as a source of tokens.
- Artboard copy is Brazilian Portuguese only. English copy is not designed.

## Status classes

- **Provisional:** part of the provisionally approved direction; needs the maintainer's visual
  review.
- **Disabled at launch:** designed, but must not ship until its trigger exists.
- **Planned / future:** concept only; do not implement.
- **Legal draft:** needs legal review; placeholders stay; do not publish.
- **Reference:** context only.
- **Unresolved:** specification incomplete or depends on an open decision.

## Artboards

| Artboard | Shows | Status |
| --- | --- | --- |
| Main, HomeMobile | Home at 1440 and 390/360 | Provisional |
| Workspace, WorkspaceMobile | Compress image page (50 KB variant) at 1440 and 390/360 | Provisional. No artboard for 600–1023 px |
| WorkspaceStates, WorkspaceStatesMobile, WorkspaceStatesMore, WorkspaceStatesMoreMobile | Panel states (drag, wrong file, preparing, processing, ready, mixed, too large, cancelled, already fits, changed format, impossible, no JavaScript, no connection, no support) | Provisional; several states need new behavior or are not supportable (see [`discrepancies.md`](discrepancies.md)) |
| FoldCheck | Tool page and home at 360 × 800 and 390 × 844 | Reference |
| SiteHeader, SiteFooter, NavFooter, MenuMobile | Header and footer components; width matrix (1440, 1024, 768, 390, 360); phone menu | Provisional. Menu implementation unresolved |
| About, AboutMobile | About page | Provisional; placeholders remain (creator name, short text) |
| Help, HelpMobile | Help and contact | Unresolved: topic links have no content, contact addresses are unverified, browser list is a placeholder |
| NotFound, NotFoundMobile | 404 | Provisional |
| ServerError, ServerErrorMobile | Server error page | Unresolved: the host serves static assets only (see [`discrepancies.md`](discrepancies.md)) |
| Language, LanguageMobile | Language suggestion (ADR 0019) | Provisional; restyle of an existing feature |
| OgImages | 1200 × 630 share images | Provisional; production method unresolved |
| Legal, LegalMobile, LegalTerms, LegalCookies | Privacy, terms, cookies | Legal draft |
| MenuDesktop, MenuDesktopFull | Tools menu | Disabled at launch (needs 2+ live tools) |
| Search, SearchMobile | Search | Disabled at launch (needs a JavaScript exception to rule 5, via ADR) |
| FileFirst, FileFirstMobile, FileChoice | Start from the file | Disabled at launch (needs an ADR on how the file reaches the tool without leaving the device) |
| Category, CategoryMobile, CatalogCompare | Category page; list versus grid | Disabled at launch (needs 2+ tools in the category) |
| ToolsImage, ToolsMedia, ToolConcept, ToolInventory | Concepts for 13 tools | Planned / future |
| MergePdf, MergePdfMobile, MergeStates, MergePanel | Merge PDF | Planned / future |
| AiConsent, AiConsentMobile, ToolsAi, AiToolConcept | AI concepts | Future; server-side AI belongs to the private cloud repository |
| Sitemap, Direction | Site map by status; visual direction | Reference. Direction still shows search and HEIC, which later decisions removed |

## Visual fundamentals observed

- **Colour:** v1 tokens in all launch screens. `scrim` appears only in AI concepts.
- **Type:** Fredoka and Figtree, with v1 styles plus off-scale sizes (16, 18, 26, 28, 36, 72 px).
- **Space and radius:** the v1 scale plus off-scale values; see [`additions.md`](additions.md).
- **Motion:** press, squish and ready (v1), plus an infinite indeterminate bar and a 200 ms
  chevron rotation (not in v1).
- **Layout:** `content-max` 1240 px, `reading-max` 700 px, breakpoints at 600 and 1024 px;
  cards that overlap their colour block.
- **Themes:** light and dark, same layout.

## Future product concepts (not for this repository now)

Premium, accounts, API, CLI, MCP and server-side AI are not exposed. The reference only
sketches them as concepts.
