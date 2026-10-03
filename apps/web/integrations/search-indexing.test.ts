import { describe, expect, it } from 'vitest'
import { applyIndexingHeaders, NOINDEX_HEADER, robotsTxt } from './search-indexing.ts'

const site = new URL('https://mochifile.com')
const headers = '/*\n  X-Frame-Options: DENY\n'

describe('robotsTxt', () => {
  it('disallows everything while indexing is blocked', () => {
    expect(robotsTxt(false, site)).toBe('User-agent: *\nDisallow: /\n')
  })

  it('allows everything and links the sitemap once indexing is allowed', () => {
    expect(robotsTxt(true, site)).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://mochifile.com/sitemap-index.xml\n',
    )
  })
})

describe('applyIndexingHeaders', () => {
  it('adds noindex to the existing /* rule while indexing is blocked', () => {
    const headers = '/*\n  X-Frame-Options: DENY\n\n/_astro/*\n  Cache-Control: immutable\n'
    expect(applyIndexingHeaders(headers, false)).toBe(
      `/*\n${NOINDEX_HEADER}\n  X-Frame-Options: DENY\n\n/_astro/*\n  Cache-Control: immutable\n`,
    )
  })

  // Cloudflare keeps only the last rule for a repeated path, which would drop the CSP.
  it('never adds a second /* rule', () => {
    const result = applyIndexingHeaders(headers, false)
    expect(result.split('\n').filter((line) => line === '/*')).toHaveLength(1)
  })

  it('adds a /* rule when there is none', () => {
    expect(applyIndexingHeaders('/_astro/*\n  Cache-Control: immutable', false)).toBe(
      `/_astro/*\n  Cache-Control: immutable\n/*\n${NOINDEX_HEADER}\n`,
    )
  })

  it('leaves the headers untouched once indexing is allowed', () => {
    expect(applyIndexingHeaders(headers, true)).toBe(headers)
  })
})
