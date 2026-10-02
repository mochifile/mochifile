# Testing

| Layer | Tool | Where | Run |
| --- | --- | --- | --- |
| Unit | Vitest | `*.test.ts(x)` next to the code | `pnpm test` |
| Components | Vitest + Testing Library (jsdom) | `packages/ui` | `pnpm test` |
| End-to-end | Playwright (Chromium, Firefox, WebKit) | `apps/web/e2e` | `pnpm test:e2e` |

## Unit tests

- Every tool's `process()` is tested directly — it is pure, so no worker or browser is needed.
  Cover the happy path, each option, limits and cancellation.
- The worker protocol is tested end to end over a real `MessageChannel`
  (`packages/tool-kit/src/worker.test.ts`).
- Build fixtures in code (`new File([...], 'a.txt', { type: 'text/plain' })`). Never commit
  personal files.

## End-to-end tests

`pnpm test:e2e` builds the site with the template tool included
(`MOCHIFILE_INCLUDE_TEMPLATE=true`, output in `apps/web/dist-e2e`) and serves it with
[`e2e/serve.ts`](../../apps/web/e2e/serve.ts), which applies the real `_headers` the way
Cloudflare does. The shared fixture in `e2e/fixtures.ts` fails a test on any console error or
Content Security Policy violation, so security regressions are caught in all three engines.

First run: `pnpm --filter @mochifile/web exec playwright install`. Run one engine with
`pnpm test:e2e -- --project=webkit`.

## In CI

GitHub Actions runs lint, typecheck, unit tests and build in one job, and the e2e suite in a
matrix (one job per engine). CodeQL scans every PR.
