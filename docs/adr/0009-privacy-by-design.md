# 0009. Privacy by design (LGPD/GDPR), cookieless analytics only

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Mochifile serves users in Brazil (LGPD), the EU (GDPR) and worldwide, and processes personal
files. Trust is central to the product. Cookie banners hurt the experience and conversion.

## Decision

- **Data minimization:** files are processed on-device whenever possible (ADR 0006). We do not
  collect file contents, file names or derived data.
- **No tracking cookies.** Analytics, when added, must be **cookieless**, aggregate and free of
  personal data (no cross-site identifiers, no fingerprinting), so no consent banner is needed
  for them.
- No third-party scripts on tool pages beyond what an ADR explicitly allows.
- Any server-side processing (private repo) processes files in memory over TLS, deletes them
  immediately after the job, and is documented in a public privacy policy before launch.
- Logs never contain file data; errors are reduced to codes.

## Consequences

- Simpler compliance and a strong, honest privacy message.
- Less behavioural data for product decisions; we rely on aggregate metrics and feedback.
- Ads (future) need careful vendor choice and consent handling; they will get their own ADR.
- Accounts and payments (private repo) will need their own data-protection review.
