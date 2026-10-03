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
- **Never again in this browser** once the visitor clicks "No, thanks", the banner's link, or
  a language-switcher link: a single `localStorage` flag (`mochifile:language-suggestion`).
  Every storage access is wrapped in try/catch; if storage is blocked, the banner still works
  and closes, and may appear again on the next visit.
- **No layout shift:** a fixed overlay at the bottom of the viewport, so nothing on the page
  moves (CLS checked in Chromium, `position: fixed` in every engine).
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
