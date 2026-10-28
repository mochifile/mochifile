# 0026. Institutional pages: Markdown copy in the app, a form that cannot send yet

- **Status:** Proposed
- **Date:** 2026-10-27

## Context

The "Site final" design adds four institutional pages: About, Sustainability, Architecture &
data handling and Contact. Three are long prose; Contact is a form. Three rules of the
repository meet them:

- Long-form copy is Markdown (ADR 0018), but only for tools, in `packages/tools/<dir>/content`.
  These pages belong to no tool.
- Rule 5: no JavaScript outside the tool island, so the form cannot be a React island.
- There is no endpoint to send a message to, and the artboard's anti-spam check (for example
  Cloudflare Turnstile) is a third-party script, which needs its own ADR (rule 8 and ADR 0012).

## Decision

- **Copy.** Each page's prose is `apps/web/src/content/pages/<locale>/<page id>.md`, in a second
  content collection (`pageContent`) without frontmatter, rendered at build time. Titles,
  eyebrows, descriptions and every form text are Paraglide messages in
  `packages/i18n/messages/pages/<locale>.json`, a separate file so that these pages' keys never
  conflict with other changes to `messages/<locale>.json`.
- **Routes.** One file per page and locale (`about.astro`, `pt/sobre.astro`, …). Slugs are
  translated and listed in `apps/web/src/lib/pages.ts`, which also builds the `hreflang` paths
  and is tested against the tool slugs.
- **Contact form, no script.** The form is complete (topic, name, email, message) and uses
  native validation. A field shows its message once it has been used (`:user-invalid`). While
  the form is invalid the visible button is a submit button, so the browser reports what is
  missing. A submit button cannot invoke a popover, so once the form is valid a plain button
  opens a "not available yet" notice (the declarative Popover API, as the phone menu does in
  ADR 0023). Without the Popover API the notice is plain text under the button. The form has
  `method="dialog"` and no field has a `name`, so submitting never navigates and nothing can be
  sent, even by accident. It never shows a success state.
- **No placeholders.** The artboards' yellow placeholders are not shipped: nothing about the
  founding story, the maker, renewable energy, server locations or an analytics provider is
  invented. The anti-spam block is left out until it has a decision.

## Consequences

- Translating a page is one Markdown file and one block of messages, like a tool.
- Sending a message needs a follow-up: an endpoint (in the private cloud repository), the
  anti-spam decision, and replacing the notice with a real result. Until then the page gives the
  email address instead.
- The form's behaviour depends on `:user-invalid`, `:valid` on the form, `:has()` and the
  Popover API. All are supported by current Chromium, Firefox and WebKit; older browsers show
  the notice as text and lose the live field messages, never the form.
