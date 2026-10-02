# 0003. Open core licensing: AGPL-3.0 public repo, private cloud repo

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

We want the community to see, trust and improve the tools — privacy claims are more credible
when the code is public. We also need a sustainable business (accounts, paid plans, server-side
AI) without a competitor simply rehosting our work as a closed service.

## Decision

- This repository (`mochifile/mochifile`) is public under the **GNU AGPL-3.0**. It contains the
  site, the tool contract, all browser-side tools and shared packages.
- A separate **private** repository (`mochifile/cloud`) will contain accounts, payments,
  server-side AI and any `runtime: 'server'` tool implementations.
- The public repo never depends on the private one. The private repo may consume public
  packages (which will then need a build step to be published; see `AGENTS.md`).
- Contributions are accepted under the AGPL-3.0 (inbound = outbound). No CLA for now.

## Consequences

- Anyone running a modified version as a network service must publish their changes (AGPL §13).
- Dependencies and WebAssembly engines must have AGPL-compatible licenses; this is checked in
  review.
- Without a CLA, relicensing contributed code later would require contributors' consent.
- Features must be placed deliberately: browser-side value is open; server-side cost is private.
