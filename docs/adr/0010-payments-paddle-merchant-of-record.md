# 0010. Payments via Paddle as Merchant of Record (future, private repo)

- **Status:** Accepted (not yet implemented)
- **Date:** 2026-10-02

## Context

Mochifile will offer paid plans to a global audience. Selling software internationally means
collecting and remitting VAT/GST/sales tax in many jurisdictions, handling invoices, refunds,
chargebacks and local payment methods (including Pix in Brazil) — far more than a small team can
manage directly.

## Decision

Use **Paddle as Merchant of Record** for payments when paid plans launch. Paddle is the seller of
record and handles tax, invoicing and compliance. All payment code lives in the **private**
`mochifile/cloud` repository; this public repo only links to checkout and never handles card or
payment data.

## Consequences

- Global tax compliance is outsourced; fees are higher than a pure payment processor.
- No payment secrets or SDKs in the public repo.
- Revisit if fees or regional payment-method coverage become a problem.
