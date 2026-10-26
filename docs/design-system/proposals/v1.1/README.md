# Design System v1.1: proposal for the launch redesign

**Status: Proposed. Non-normative.** Nothing in this folder is approved for implementation.

Design System v1 ([`../../README.md`](../../README.md), [`tokens.json`](../../tokens.json) and
the component READMEs) stays authoritative. This folder proposes an **additive** v1.1: new
components and page patterns built from existing tokens. It does not replace v1 and does not
add tokens. Agents may read, evaluate and revise these documents, but must not implement them
as a specification (AGENTS.md, rule 11).

## What is in this folder

| File | Purpose |
| --- | --- |
| [`additions.md`](additions.md) | Proposed components and patterns, the mobile menu requirements and candidates, and where each off-scale value goes |
| [`reference-inventory.md`](reference-inventory.md) | Inventory of the 53 design artboards (the "Bloco e cartão" design reference), classified by status |
| [`discrepancies.md`](discrepancies.md) | Differences between the design and the code, corrected facts, verified technical behavior and how feasible each panel state is |
| [`roadmap.md`](roadmap.md) | Proposed PR sequence, dependencies on PR #25 and what would need an ADR |

## How to read the status of each statement

Every document separates five kinds of statement. Do not merge them.

1. **Approved product decisions:** decided by the maintainer (listed below).
2. **Provisional visual direction:** the "Bloco e cartão" direction is provisionally approved;
   **final visual approval has not been granted.**
3. **Unresolved decisions:** open questions, listed below and in each document.
4. **Existing technical behavior:** verified in the repository; stated with its source.
5. **Future implementation proposals:** what a later PR might do. Not decided.

## Approved product decisions

1. Design System v1 is authoritative; the evolution is additive (v1.1), not a v2 replacement.
2. PR #25 (Convert image) stays open until its own functional review is complete. It is not
   merged to unblock the redesign, and the redesign must account for it.
3. Compress image keeps its automatic processing: configure first, then process when files are
   added. There is no separate "Compress N images" confirmation button in this migration.
4. Tools whose job is arranging files (such as a future Merge PDF) use review-first processing.
5. "MB → KB" is a decorative representation of compression, not a dynamic claim or a result.
6. Size presets and tool availability are derived from the tool manifests.
7. Brazilian Portuguese writes "a Mochifile".
8. Existing localized SEO slugs are preserved. New routes follow the manifest-driven approach
   and are not published until approved.
9. Category pages stay out of public navigation while a category has only one available tool.
10. `noindex` stays until explicit launch authorization (ADR 0014).
11. No unlaunched tools, Premium, API, CLI, MCP or cloud processing are exposed.
12. Files under `docs/design-system/proposals/` are non-normative.

## Provisional visual direction

"Bloco e cartão": one colour block per screen says where you are, and a white card holds the
task. Personality (mascot, drops, measure line) stays at the edges. This direction is
**provisionally approved**. The individual screens, in both themes, still need the maintainer's
visual review.

## Unresolved decisions

Visual:

- Final visual approval of the whole set, in light and dark.
- Panel and card overlap (104 and 128 px) against existing tokens.
- 18 px button labels against `label-lg` (20 px).
- Small icon sizes; menu trigger at 44 or 48 px.
- The icon of the "Choose photos" button (neutral or none; never an upload arrow).
- The mascot peeking behind the home card, with long text at 360 px.
- Home and tool layout between 600 and 1023 px (no artboard exists).
- FAQ as native `<details>` or as headings (also a technical question).
- Step legend "2. Format" or the current "2. Save as" (touches 14 content files).
- Destination of the home call to action (general page, which starts at 100 KB, or the 50 KB
  variant).
- Which sizes the "start here" card lists (all manifest presets or a marked subset).
- Whether the Ctrl+V hint and "50 MB each" stay on phones, and the fate of the "Good to know"
  box.
- Duration and easing of the indeterminate progress bar.

Technical:

- The mobile menu implementation (see [`additions.md`](additions.md)).
- Where the decorative "MB → KB" text comes from for each tool.
- What "Change options" does after processing, and what happens to outdated results.
- Whether a "browser not supported" state can be built on a verifiable criterion.
- How Open Graph images are produced (static files or at build time).

Outside design: legal review of the privacy, terms and cookies pages, the data controller, which
contact addresses exist, who approves the English copy of the new screens.

## Criteria to move a proposal to Accepted

- The maintainer reviews the screens in both themes and records the approval in the PR that
  accepts them.
- Each accepted item has a component README under `../../components/` (and any new token goes
  through `tokens.json`, regenerated by the script, as ADR 0020 requires).
- The decisions it depends on are no longer open.
