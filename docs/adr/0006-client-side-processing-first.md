# 0006. Client-side processing first, Web Workers mandatory for heavy work

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Users hand us personal files: ID photos, documents, voice notes. Uploading them creates privacy
risk, legal obligations and server cost, and is slow on mobile networks. Modern browsers can do
most of this work locally, especially with WebAssembly.

## Decision

- Tools run **in the browser by default** (`runtime: 'browser'`). A server path
  (`runtime: 'server'`) is allowed only when the browser genuinely cannot do the job, requires an
  ADR, and lives in the private cloud repo.
- All processing runs in a **Web Worker** through `exposeTool` / `createToolClient`
  (Comlink-based) from `@mochifile/tool-kit`. The main thread only handles UI.
- `process()` is a **pure function**: files + options + `{ signal, onProgress }` → results. No DOM,
  no network, no logging of file data. It must honour cancellation.
- WebAssembly engines (Phase 1) are loaded only inside workers, only when a job starts.

## Consequences

- Strong privacy story and near-zero marginal cost per job.
- The UI stays responsive during heavy work; jobs can be cancelled.
- Performance depends on the user's device; limits in each manifest protect low-end devices.
- `process()` can be unit-tested in Node without a browser.
- Some engines need `SharedArrayBuffer`, which requires cross-origin isolation (ADR 0011).
