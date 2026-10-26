# 0018. Tool variant pages and Markdown page copy

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

People search for a tool together with a specific need ("compress image to 50 KB"), and a
page that answers exactly that serves them better than a generic one. The first real tool,
"Compress image to target size", needs one landing page per common target, each with its own
title, description, URL in every locale, and genuinely useful copy (intro, how it works,
tips, FAQ), plus the main tool page.

Until now a tool had exactly one page per locale, and every user-facing string went through
Paraglide messages ([ADR 0007](0007-i18n-per-locale-urls.md)). Paraglide works well for short
UI strings. Several hundred words of copy per page, in every locale, would become dozens of
keys such as `compress_image_50kb_faq_2_answer`, which are hard to write, review and keep
coherent.

## Decision

**Variants.** A manifest may declare `variants`: extra pages of the same tool, each with a
`key`, preset `options` (applied over `defaults`; every key must exist in `defaults`), and
`meta` per locale (slug, title, description). They are validated like the main page. Their
slugs share one namespace with every tool's pages (`assertUniqueTools`). The site:

- builds a page per variant in every locale, starting the tool UI with the variant's options
  (`initialOptions` prop);
- links each page to the tool's other pages, and lists variants under the tool on the home
  page;
- emits canonical, `hreflang` (including `x-default`), a sitemap entry, visible breadcrumbs,
  and `WebApplication` + `BreadcrumbList` JSON-LD for every page.

**Markdown page copy.** Long-form copy for each page lives next to the tool, as
`packages/tools/<dir>/content/<locale>/<key>.md`, where `<key>` is `index` for the main page or
the variant key. It is loaded through an Astro content collection and rendered to static HTML
at build time; it never ships as JavaScript. The build fails if any page lacks copy in any
locale. Short UI strings (labels, buttons, errors, notices) stay in Paraglide messages. Page
`title` and `description` stay in the manifest, because routing and SEO are generated from it.

**Sitemap alternates.** `@astrojs/sitemap`'s i18n option assumes a page has the same path in
every locale, so it produced no alternates for tool pages with translated slugs. Each sitemap
entry now takes the `hreflang` alternates declared by its built page, so the two cannot
disagree.

## Consequences

- One tool can rank for many precise searches without duplicating code. Each variant page
  must have its own useful copy, not near-duplicates, or it should not exist.
- Copy is reviewable as prose, in one file per page and locale.
- AGENTS.md rule 6 now distinguishes UI strings (Paraglide) from long-form page copy
  (Markdown).
- Adding a locale also means adding a Markdown file for every tool page.
- The `_template` tool has one demo variant and its copy, so the whole flow is covered by e2e
  tests before any real tool uses it.

## Updates

- **2026-10-26: steps and FAQ as frontmatter.** The tool page lays out two parts of the copy
  itself: the steps (beside the title from 1024 px, after the tool panel below it) and the
  FAQ (native `<details>`), following the "Bloco e cartão" direction (design-system proposal
  v1.1). They move from the Markdown body into its frontmatter, validated by the content
  collection's schema (`apps/web/src/lib/page-copy.ts`): `steps` (2–4 short lines) and `faq`
  (questions with plain-text answers). Both are optional, so copy without them still builds.
  They stay in the same per-page, per-locale file, not in the manifest: they are long-form
  copy, reviewed as prose. Every answer must describe what the tool really does.
