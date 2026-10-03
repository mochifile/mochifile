# 0019. Language suggestion banner, never a redirect

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

[ADR 0007](0007-i18n-per-locale-urls.md) forbids redirecting by browser language: every page
has its own URL per locale, search engines must see the page they asked for, and people must
land where the link points. But a Portuguese speaker who lands on an English page (from a
search result or a shared link) may not notice the small language switcher.
[AGENTS.md](../../AGENTS.md) rule 5 also keeps pages free of JavaScript except the tool
island, and the home page shipped none at all.

## Decision

Show a small, dismissible **suggestion**, never a redirect:

- **When:** the visitor's highest-ranked language in `navigator.languages` (matched by primary
  subtag) is a locale this page exists in and differs from the page's own. A browser set to
  `en-GB, pt-BR` on an English page sees nothing; `pt-BR, en` sees the Portuguese suggestion.
- **What:** one banner per other locale is rendered at build time, hidden, written in that
  locale ("Ver esta página em português?"), with `lang` set, linking to this page's
  alternate (the same paths as its `hreflang` links). The script only un-hides one. Pages
  without alternates (404) render none.
- **Never again in this browser** once the visitor clicks "Not now" ("Agora não"), the banner's link, or
  a language-switcher link: a single `localStorage` flag (`mochifile:language-suggestion`).
  Every storage access is wrapped in try/catch; if storage is blocked, the banner still works
  and closes, and may appear again on the next visit.
- **No layout shift:** a fixed overlay, so nothing on the page moves (CLS checked in Chromium,
  `position: fixed` in every engine).
- **Placement:** on phones (narrower than 640 px) it sits at the **top** of the viewport, over
  the header and page title. At the bottom it covered the top of the compress-image file
  picker on every tool page at 390 × 844, in both languages; at the top it cannot cover a
  tool's primary action on first view, because every page starts with its header and title.
  On wider screens it sits at the bottom. An e2e test checks, at 390 × 844 on tool pages in
  both languages, that the banner and the file picker do not overlap and that a tap on the
  picker reaches it.
- **iOS safe areas:** the edge offsets are `calc(1rem + env(safe-area-inset-top))` and
  `calc(1rem + env(safe-area-inset-bottom))`. The site does not set `viewport-fit=cover`, so
  today Safari keeps pages inside the safe area and these insets are 0; the offsets keep the
  banner clear of the notch and home indicator if that ever changes.
- **One bottom panel at a time:** only one panel may show at the bottom of the viewport at a
  time, and the future cookie-consent banner takes priority: while it is visible, the language
  suggestion must not show at the bottom. Whoever adds the cookie banner adds that check to the
  language suggestion script, with a test. (Suggestion, not yet decided: also hold the language
  suggestion back on phones, where it sits at the top, so a first visit never shows two
  panels.)
- **Accessible:** an `<aside>` landmark named in the suggested language, real link and button,
  reachable by keyboard; focus is never moved to it.
- **JavaScript:** one inline module script on every page (about 730 bytes, 400 gzipped),
  hashed into the CSP by `csp-hashes` like other inline scripts. An e2e test keeps it the only
  script on non-tool pages and under 1 KB gzipped. AGENTS.md rule 5 now names this as the one
  exception.

## Consequences

- Visitors are offered their language without losing the page they asked for, and crawlers
  are unaffected: the banner is hidden in the HTML and nothing redirects.
- Every page now ships a tiny script; the "zero JavaScript" rule has one documented,
  size-capped exception.
- Adding a locale adds one hidden banner per page automatically; its three strings
  (`language_suggestion_*`) must be translated like any other message.
