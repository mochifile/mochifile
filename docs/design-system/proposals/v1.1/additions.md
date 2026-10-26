# Proposed additions (v1.1)

**Status: Proposed. Non-normative.** See [`README.md`](README.md). Design System v1 stays
authoritative. This document proposes no new tokens in `tokens.json`.

## Proposed components and patterns

Everything below is built from existing tokens unless the last column says otherwise.

| Item | Kind | Existing tokens and constants it uses | Needs an addition? |
| --- | --- | --- | --- |
| SiteHeader (with phone menu and "Skip to content") | Component | `surface-page`, `ink`, `border-control`, `focus-ring`, `target-min`, logo widths | The language link width was measured for two links; re-measure |
| SiteFooter | Component | `surface-inverse`, `ink-on-inverse(-muted)`, `radius-2xl` squish, `target-min` | No. Must keep the "Open-source licenses" link |
| Result banner (matcha, mango, ube) | Component | Blocks, `ink-on-block`, `radius-xl` squish, Mascot | No |
| File name (middle ellipsis, extension always visible) | Component | `body-strong`, `body-sm` | No. Full name in the accessible label, not only in `title` |
| Phone option list ("label · value · Change") | Component | `surface-sunken`, `line`, `label-lg`, `body` | No |
| State block (no JavaScript, compressor did not load) | Pattern | Mascot `error`, `surface-sunken`, Button | No |
| Indeterminate progress bar | Variant and motion rule | `line`, `action` | **Yes:** a motion rule for the only looping animation (duration, easing). Proposed: only while real work happens; still under reduced motion |
| "Start here" card | Page pattern | `surface-card`, `radius-xl` squish, Button, SizeChip | No |
| Privacy band | Page pattern | `surface-inverse`, `surface-inverse-raised` | No |
| Measure line and drops | Brand pattern | `ink-on-block`, `strawberry`, `matcha`, the 2.5 px border constant | No: delivered as SVG assets (percentage radii inside the SVG, no arbitrary CSS) |
| "MB → KB" | Decoration | Fredoka, `ink-on-block` | No. `aria-hidden`; never a result or a promise |
| 1024 px breakpoint | Component constant | Tailwind `lg` (64rem), already used by `tool-reserve` | Not a token. Document it as a component constant |

A "browser not supported" state is **not** proposed until a verifiable detection criterion
exists (see [`discrepancies.md`](discrepancies.md)).

## Off-scale values: where each one goes

The canvas uses values that are not in the v1 scale. Rule: compare both options on screen and
record the choice in the PR that implements it. Do not round everything mechanically.

| Canvas value | Proposal | Status |
| --- | --- | --- |
| Space 2, 5, 6 px | `space-1` (4), `space-1`, `space-2` (8) | Uses tokens |
| Space 10, 14 px | `space-3` (12) | Uses tokens |
| Space 18, 22, 28 px | `space-5` (20), `space-6` (24), `space-8` (32) | Uses tokens; check the fold and the home button at 1024 px |
| Space 48, 72 px | `space-10` (40) or `space-14` (56); `space-16` (64) | Uses tokens |
| Overlap of the tool panel (104, 64 px) and the home card (128, 96 px) | 64 is `space-16`; 104 and 128 are not tokens | **Pending visual:** use `space-14`/`space-16` or a justified component constant (like `tool-reserve`) |
| Font 16 px | `body` (17) or `body-sm` (15) | Uses tokens |
| Font 18 px (row button labels) | `label-lg` (20), stacking buttons on phones | **Pending visual:** an addition only if `label-lg` fails at 360 px |
| Font 26, 28, 36, 72 px | `title-sm` 24, `title` 34, `display-xl` 64 | Uses tokens (share images are static) |
| Radius 20, 22, 24, 30 px | Existing squish patterns of `radius-lg` | Uses existing constants |
| Radius 8, 10, 12 px | `radius-sm` (14) | Uses tokens |
| Radius 2, 6 px | `radius-pill` or none | Uses tokens |
| Icons 14, 16, 18, 20 px | The 24 px grid or the 22 px button icon | **Pending visual** |
| Menu trigger 48 px | `target-min` (44) | **Pending visual** |
| Chevron rotation 200 ms | No animation | Proposal |
| `scrim`, `dialog-max`, `surface-code` | Out of v1.1 | Only the future concepts use them |

## Mobile navigation

**Existing behavior.** The header has the logo and two language links. It has no menu, no
`<details>` and no `popover`. AGENTS.md rule 5 allows no JavaScript outside the tool island,
with one exception: the language suggestion script (ADR 0019). That suggestion is a fixed
overlay at the **top** of the screen below 640 px, over the header, until dismissed.

**Requirements for any implementation (proposed):**

1. **Trigger.** A native control (`<button>` or `<summary>`), localized name ("Menu"), at least
   44 px, visible focus ring, open and closed state exposed to assistive technology. Shown only
   below 1024 px; from 1024 px the links sit in the header and the menu does not exist.
2. **Open.** Enter and Space. Focus does not jump; the next Tab enters the menu.
3. **Escape.** Closes the menu and returns focus to the trigger.
4. **Close with the trigger.** Focus stays on the trigger.
5. **Follow a link.** Navigates; the new page starts closed.
6. **No focus trap, no obscured focus (WCAG 2.4.11).** A non-modal menu must not cover the
   content that Tab reaches after its last item.
7. **Tab order.** Skip link, logo, language, menu trigger, menu items (when open), content.
8. **Responsive.** Crossing 1024 px with the menu open is resolved by CSS alone; nothing
   breaks and nothing hidden stays focusable.
9. **Reduced motion.** No animation; opening and closing are instant.
10. **Language suggestion.** The trigger stays reachable by keyboard and touch while the
    suggestion is visible. An end-to-end test must prove it.
11. **Content.** Compress image (from the registry), About and Help (only once published), the
    language link. No search.

**Candidates (not a final decision):**

| Option | JavaScript | Escape | Focus restored | Main risk |
| --- | --- | --- | --- | --- |
| **Preferred candidate: declarative HTML Popover API** (`popover` + `popovertarget`, no script) | None | Native | Native on Escape and on the trigger (verify per engine) | Top layer: if it covers the page, Tab continues underneath (requirement 6). Browsers without support must degrade acceptably. Required browser support is not yet defined |
| **Fallback: in-flow `<details>`** (pushes content down) | None | No (requirement 3 fails) | Not applicable | Escape is missing; no obscured focus. The Escape gap needs an explicit exception |
| Script | Yes | Yes | Yes | Needs an ADR for an exception to rule 5 and a JavaScript budget check; only if both fail |

The Popover API is the preferred candidate, not a decision. Before choosing, validate against
the required browser support, accessibility expectations, focus handling, Escape behavior and
the interaction with the language suggestion, with a tested prototype in Chromium, Firefox and
WebKit. The final choice is recorded in the SiteHeader component README.

This proposal changes no header and adds no JavaScript.
