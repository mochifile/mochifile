# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Mochifile is open source and will be developed by maintainers, outside contributors and AI
coding agents. Without a written record, the reasons behind decisions get lost, are re-debated,
or are silently undone by someone who does not know the constraints.

## Decision

We will record architecturally significant decisions as lightweight ADRs in `docs/adr/`,
one Markdown file per decision, numbered sequentially, using the format in
`0000-template.md` (Status, Date, Context, Decision, Consequences). ADRs are written in English.
A decision that changes an earlier one gets a new ADR that supersedes it.

## Consequences

- Contributors and agents can learn *why* things are the way they are; `AGENTS.md` links here.
- Significant changes (new dependency categories, new services, server-side processing,
  security policy changes) require an ADR in the same PR.
- A small writing cost per decision.
