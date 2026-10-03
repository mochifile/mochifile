/**
 * PRE-LAUNCH SWITCH: whether search engines may index the site (ADR 0014).
 *
 * While `false`, every build sends `X-Robots-Tag: noindex` on all responses and serves a
 * `robots.txt` that disallows everything. Set it to `true` only at launch, following the
 * steps in docs/adr/0014-block-search-indexing-until-launch.md. This is the only switch.
 */
export const ALLOW_SEARCH_INDEXING = false
