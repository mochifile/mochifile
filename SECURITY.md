# Security policy

Mochifile handles people's personal files, so we take security seriously.

## Reporting a vulnerability

**Please do not open a public issue.** Email **security@mochifile.com** with:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- affected URLs, versions or commits,
- whether you would like to be credited.

Please do not include real personal files; describe them or use synthetic ones.

We aim to acknowledge reports within **3 business days**, give a first assessment within
**10 business days**, and keep you informed until a fix ships. We ask that you give us a
reasonable time to fix the issue before disclosing it publicly, and we will credit you unless
you prefer otherwise.

## Scope

In scope: this repository and the site it builds (mochifile.com), including the Content
Security Policy, the tool contract and anything that could expose user files.

Out of scope: the private `mochifile/cloud` services (report them to the same address, they
are handled separately), denial of service through very large files processed in your own
browser, and findings from automated scanners without a demonstrated impact.

## Supported versions

Only the latest deployment of `main` is supported.

## Safe harbor

We will not pursue legal action against good-faith research that follows this policy, avoids
privacy violations and service disruption, and does not access other people's data.
