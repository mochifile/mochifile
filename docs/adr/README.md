# Architecture decision records

We record significant decisions as short ADRs ([ADR 0001](0001-record-architecture-decisions.md)).
To add one, copy [`0000-template.md`](0000-template.md) to the next number, fill it in, and open
a PR. Accepted ADRs are not edited later except for their status; a new ADR supersedes an old one.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-product-name-and-brand-usage.md) | Product name and brand usage rule | Accepted |
| [0003](0003-open-core-licensing.md) | Open core licensing: AGPL-3.0 public repo, private cloud repo | Accepted |
| [0004](0004-monorepo-pnpm-turborepo.md) | Monorepo with pnpm workspaces and Turborepo | Accepted |
| [0005](0005-astro-with-react-islands.md) | Astro with React islands | Accepted |
| [0006](0006-client-side-processing-first.md) | Client-side processing first, Web Workers mandatory | Accepted |
| [0007](0007-i18n-per-locale-urls.md) | i18n: per-locale URLs, no auto-redirect, Paraglide, hreflang | Accepted |
| [0008](0008-cloudflare-hosting.md) | Cloudflare hosting | Accepted |
| [0009](0009-privacy-by-design.md) | Privacy by design (LGPD/GDPR), cookieless analytics only | Accepted |
| [0010](0010-payments-paddle-merchant-of-record.md) | Payments via Paddle as Merchant of Record | Accepted (future) |
| [0011](0011-cross-origin-isolation-per-route.md) | Cross-origin isolation only on pages that need it | Accepted |
| [0012](0012-content-security-policy.md) | Content Security Policy | Accepted |
| [0013](0013-deploy-workers-static-assets-from-github-actions.md) | Deploy to Cloudflare Workers static assets from GitHub Actions | Accepted |
| [0014](0014-block-search-indexing-until-launch.md) | Block search indexing until launch | Accepted |
| [0015](0015-canonical-host-and-domain-redirects.md) | Canonical host mochifile.com and domain redirects | Accepted |
| [0016](0016-image-engine-jsquash-with-native-decoding.md) | Image engine: jSquash codecs with native decoding | Accepted |
| [0017](0017-size-targeting-algorithm.md) | Size-targeting algorithm | Accepted |
| [0018](0018-tool-variants-and-markdown-page-copy.md) | Tool variant pages and Markdown page copy | Accepted |
| [0019](0019-language-suggestion-banner.md) | Language suggestion banner, never a redirect | Accepted |
