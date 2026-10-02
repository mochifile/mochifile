# 0005. Astro with React islands

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Most Mochifile traffic will come from search engines landing on a single tool page, often on
low-end phones. Pages must be fast and mostly static (copy, FAQs, SEO metadata), while each
tool needs a rich interactive UI.

## Decision

- Build the site with **Astro** using **static output**.
- Use **React** only inside islands, where interactivity is required. Tool pages have a single
  island (`ToolIsland`, rendered `client:only`) that lazy-loads the tool's `Ui.tsx`.
- Style with **Tailwind CSS v4**, with design tokens defined as CSS variables in
  `packages/ui/src/tokens.css`.
- Generate tool routes from manifests (`getStaticPaths`), never by hand.

## Consequences

- Non-tool pages ship zero JavaScript; tool pages ship only their own code.
- React is a widely known UI library, which helps contributors.
- `client:only` means the tool UI is not server-rendered: a skeleton is shown until it loads.
  This avoids a server-rendered file input that ignores files chosen before hydration. SEO
  content (title, description, copy) is still static HTML.
- Astro islands inject small inline scripts and styles; the CSP handles them with build-time
  hashes (ADR 0012).
