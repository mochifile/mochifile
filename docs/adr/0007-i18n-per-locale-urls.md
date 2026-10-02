# 0007. i18n: per-locale URLs, no auto-redirect, Paraglide, hreflang

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Mochifile targets a global audience, starting with English and Portuguese. People search in
their own language ("comprimir imagem"), so each language needs its own indexable page. Automatic
language redirects confuse search engines, break shared links and annoy people who prefer
another language.

## Decision

- **URLs:** the default locale (English) is served at the root without a prefix (`/`); every
  other locale under `/<locale>/` (`/pt/`). Tool slugs are localized per locale. Paths end with
  a slash.
- **No automatic redirects** by `Accept-Language`, IP or cookie. A language switcher links to
  the same page in other locales.
- Every indexable page emits a **canonical** link and **`hreflang` alternates** for every locale
  plus `x-default` (English). The sitemap carries the same alternates.
- **Astro i18n routing** (`prefixDefaultLocale: false`, `redirectToDefaultLocale: false`)
  handles routing; **Paraglide JS** compiles messages into typed, tree-shakable functions. The
  locale is always passed explicitly (`m.key({}, { locale })`); Paraglide's own URL strategies
  and middleware are not used.
- Site messages live in `packages/i18n/messages`; each tool keeps its messages in its own
  package, listed in the inlang project's `pathPattern`.

## Consequences

- Each locale is independently indexable; links are shareable and stable.
- Adding a locale touches the locale list, message files, tool manifests and two page files.
- Tests enforce that all locales have the same message keys and that keys are unique.
- Paraglide's inlang plugin (`@inlang/plugin-message-format`) is installed from npm as a
  pinned devDependency and referenced by local path in `project.inlang/settings.json`, instead
  of the default jsDelivr URL. Builds are reproducible, covered by the lockfile and Renovate,
  and work offline. Tests reject remote plugin URLs and check that every message compiled,
  because Paraglide only warns when a plugin fails to load.
