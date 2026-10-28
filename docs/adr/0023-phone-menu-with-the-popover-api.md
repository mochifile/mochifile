# 0023. Phone menu with the declarative Popover API, and a header-aware language suggestion

- **Status:** Proposed in [PR #29](https://github.com/mochifile/mochifile/pull/29); Accepted
  when that PR is merged
- **Date:** 2026-10-26
- **Amended by:** [ADR 0030](0030-v2-site-shell.md): the menu now lists the V2 links, buttons and
  languages, and the header is 84px tall; the mechanism below is unchanged

## Context

The launch redesign gives the site header tool links and, under 1024 px, a phone menu
([proposal](../design-system/proposals/v1.1/additions.md), *Mobile navigation*). The proposal
stays non-normative; the maintainer authorised only the header, the skip link and the phone
menu. [AGENTS.md](../../AGENTS.md) rule 5 allows no JavaScript outside the tool island except
the language suggestion ([ADR 0019](0019-language-suggestion-banner.md)), so the menu must work
without a script. The proposal listed three candidates: the declarative Popover API (preferred),
an in-flow `<details>` (no Escape), and a script (needs an exception to rule 5).

The language suggestion sat at the top of the screen on phones, over the header. With a menu
button in the header, that covered the button, the logo and the language link for touch and
keyboard users alike, and keyboard focus moved underneath it.

A standalone prototype was tested in Chromium and WebKit, then the real header in the
end-to-end suite (`apps/web/e2e/site-header.spec.ts`) in Chromium, Firefox and WebKit
(Playwright 1.63, on macOS and on Linux as in CI). With no script, the Popover API gave: Enter
and Space open and close the menu; focus stays on the button and the next Tab enters the menu;
Escape closes it and returns focus to the button; the button exposes its expanded state to
assistive technology. Its one gap is requirement 6 of the proposal: a top-layer menu covers the
page, and the Tab after its last item would reach links hidden beneath it (WCAG 2.4.11).

## Decision

- **Popover API, no script.** Under 1024 px a native `<button popovertarget>` (named "Menu",
  `target-min`, a pill as the brand book requires for buttons) opens a `popover` `<nav>` placed
  right after it in the DOM. From 1024 px the button and the menu are `display: none` and the
  same links sit in the header. The links come from the tool registry, plus the other
  languages; nothing unreleased.
- **Full screen, nothing obscured.** The open menu sits in the top layer from the bottom of the
  header row to the bottom of the screen. While it is open (`body:has([data-site-menu]:popover-open)`,
  under 1024 px) every other child of `body` gets `visibility: hidden`: the header stays usable,
  and the rest of the page is out of view, out of the Tab order and out of the accessibility
  tree, as behind a dialog. Tab after the last item leaves the page instead of reaching hidden
  content. Visibility changes move nothing (no layout shift), and the tool keeps working: a
  photo added before opening the menu finishes behind it and downloads after closing.
- **Closing.** Escape (focus returns to the button), the button itself, a link (the new page
  starts closed), or a press on the header outside the menu (the browser's light dismiss). A
  press on the menu's blank area does nothing: it is inside the menu. A menu only as tall as
  its links was tried and rejected: a tap below it closed the menu, and the tap's follow-up
  click then landed on the page that reappeared beneath it and opened the file picker.
- **Crossing 1024 px.** CSS alone: a menu left open is not displayed and the page is visible
  again; back under 1024 px it is still open and still works. If focus was on an element that
  stops being displayed (a menu item, the button or a header link), every engine drops it, and
  the next Tab lands on a visible element.
- **Fallback.** Utilities that need the Popover API sit in `@supports selector(:popover-open)`
  (the `with-popover:` variant). Without it, the button is not shown and the menu's links render
  in the page flow under the header, so nothing becomes unreachable.
- **Desktop links.** From 1024 px each tool link starts an equal cell between the logo and the
  language links and stays on one line, so the font swap moves nothing; a title wider than its
  cell (only with several tools on a narrow screen) is cut with "…" on screen and keeps its
  full accessible name.
- **Skip link.** "Skip to content" is the first Tab stop, out of view until focused, and moves
  focus to `<main id="content" tabindex="-1">`.
- **Language suggestion (amends ADR 0019, *Placement*).** On phones it sits right below the
  header row (`--site-header-height` + `space-2`) instead of 16 px from the top, so the header
  is never covered, and it still does not cover the file picker (the existing test still
  holds). From 600 px it stays at the bottom. It also steps out of view (`visibility: hidden`)
  while keyboard focus is in `main` or the footer, so it never hides the focused element, and
  while the phone menu is open. Everything else in ADR 0019 (when it shows, its text, its
  storage flag, its script) is unchanged.

## Consequences

- No new JavaScript: the language suggestion stays the only script on non-tool pages.
- While the menu is open the tool's status messages (`aria-live`) are out of the accessibility
  tree, like everything else beneath the menu; a result that finishes then is read on the
  page, not announced.
- After a pointer closes the menu, focus follows the browser's rules for that press (the button
  when it was pressed, in engines that focus buttons on click), not a fixed target.
- The menu's position depends on the header row being exactly `target-min` plus `space-2`
  above and below under 1024 px; the end-to-end test checks the menu starts right below it.
- Browsers without the Popover API (before Chrome 114, Safari 17, Firefox 125) see the menu's
  links always open under the header; on phones that pushes the tool below the fold there.
- When there are two or more tools, the proposal's desktop "Tools" panel would replace the
  plain links; that is a later decision.
