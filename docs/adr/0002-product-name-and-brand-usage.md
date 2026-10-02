# 0002. Product name and brand usage rule

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

The product is called Mochifile. "Mochi" alone is a common word used by many unrelated
products and brands. Shortening the name dilutes the brand, hurts search visibility and could
create trademark confusion.

## Decision

The name is always written **"Mochifile"** — one word, capital M, lowercase f — in the UI, copy,
documentation, code comments, commit messages and marketing, in every language. Never "Mochi"
alone, "MochiFile" or "Mochi File". Package scopes and identifiers use lowercase `mochifile`.

The name and logo identify the official project. Forks are welcome under the AGPL-3.0 but must
not present themselves as the official Mochifile service.

## Consequences

- Reviewers and agents reject copy that uses "Mochi" alone (listed in `AGENTS.md`).
- Translations keep the name untranslated.
- A trademark policy may be added later; this ADR is the baseline.
