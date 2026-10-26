# 0023. Phone menu with the declarative Popover API, and a header-aware language suggestion

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

The launch redesign gives the site header tool links and, under 1024 px, a phone menu
([proposal](../design-system/proposals/v1.1/additions.md), *Mobile navigation*, non-normative).
[AGENTS.md](../../AGENTS.md) rule 5 allows no JavaScript outside the tool island except the
language suggestion ([ADR 0019](0019-language-suggestion-banner.md)), so the menu must work
without a script. The proposal listed three candidates: the declarative Popover API (preferred),
an in-flow `<details>` (no Escape), and a script (needs an exception to rule 5).

The language suggestion sat at the top of the screen on phones, over the header. With a menu
button in the header, that covered the button, the logo and the language link for touch and
keyboard users alike, and keyboard focus moved underneath it.

A prototype was tested in Chromium and WebKit (Playwright 1.63, WebKit 26.6), then the real
header in the end-to-end suite (`apps/web/e2e/site-header.spec.ts`), which CI also runs in
Firefox. In both engines the Popover API gave, with no script: Enter and Space open and close
the menu; focus stays on the button and the next Tab enters the menu; Escape closes it and
returns focus to the button; a tap outside closes it; the button exposes its expanded state.
Its one gap is requirement 6 of the proposal: a top-layer menu covers the page, and the Tab
after its last item would reach links hidden beneath it (WCAG 2.4.11).

## Decision

- **Popover API, no script.** Under 1024 px a native `<button popovertarget>` (named "Menu",
  `target-min`, a pill as the brand book requires for buttons) opens a `popover` `<nav>` placed
  right after it in the DOM. From 1024 px the button and the menu are `display: none` and the
  same links sit in the header. The links come from the tool registry, plus the other
  languages; nothing unreleased.
- **Full-screen, nothing obscured.** The open menu sits in the top layer right below the header
  row. While it is open (`body:has([data-site-menu]:popover-open)`, under 1024 px) every other
  child of `body` gets `visibility: hidden`: the header stays usable, the rest is blank and
  unfocusable, so Tab after the last item leaves the page instead of reaching hidden content.
  Visibility changes move nothing (no layout shift).
- **Crossing 1024 px.** CSS alone: a menu left open is not displayed and not focusable, and the
  page is visible again; back under 1024 px it is still open and still works.
- **Fallback.** Utilities that need the Popover API sit in `@supports selector(:popover-open)`
  (the `with-popover:` variant). Without it, the button is not shown and the menu's links render
  in the page flow under the header, so nothing becomes unreachable.
- **Skip link.** "Skip to content" is the first Tab stop, out of view until focused, and moves
  focus to `<main id="content" tabindex="-1">`.
- **Language suggestion (amends ADR 0019, *Placement*).** On phones it sits right below the
  header row (`--site-header-height` + `space-2`) instead of 16 px from the top, so the header
  is never covered, and it still does not cover the file picker (the existing test still
  holds). From 600 px it stays at the bottom. It also steps out of view (`visibility: hidden`) while
  keyboard focus is in `main` or the footer, so it never hides the focused element, and while
  the phone menu is open. Everything else in ADR 0019 (when it shows, its text, its storage
  flag, its script) is unchanged.

## Consequences

- No new JavaScript: the language suggestion stays the only script on non-tool pages.
- Clicking or tapping outside the open menu closes it (light dismiss) without returning focus
  to the button; that is the browser's behaviour for pointer dismissal.
- The menu's position depends on the header row being exactly `target-min` plus `space-2`
  above and below under 1024 px; the end-to-end test checks the menu starts right below it.
- Browsers without the Popover API (before Chrome 114, Safari 17, Firefox 125) see the menu's
  links always open under the header; on phones that pushes the tool below the fold there.
- When there are two or more tools, the proposal's "Tools" panel for desktop replaces the
  plain links; that is a later decision.
