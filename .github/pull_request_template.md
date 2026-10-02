## What and why

<!-- What does this change do, and why is it needed? Link the issue: Closes #123 -->

## How to test

<!-- Steps a reviewer can follow. -->

## Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org) (e.g. `feat(tools): add heic converter`)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally
- [ ] Tests added or updated (unit for logic, e2e for user flows)
- [ ] User-facing text is translated in every locale (en, pt)
- [ ] No new dependency, or it is justified below
- [ ] User files are processed in the browser, or a server path is justified by an ADR
- [ ] No secrets, tokens or file contents in code, logs or tests
- [ ] Docs, AGENTS.md or an ADR updated if behaviour or architecture changed

## New dependencies (if any)

<!-- Name, version, size, license and why it is needed. -->
