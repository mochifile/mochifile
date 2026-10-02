import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { addHashesToHeaders, collectInlineHashes, type InlineHashes } from './csp-hashes.ts'

const empty = (): InlineHashes => ({ scripts: new Set(), styles: new Set() })
const hash = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`

describe('collectInlineHashes', () => {
  it('hashes inline scripts and styles, skipping external and data scripts', () => {
    const html = [
      '<style>a{color:red}</style>',
      '<script>console.log(1)</script>',
      '<script type="module" src="/_astro/x.js"></script>',
      '<script type="application/ld+json">{"@type":"WebSite"}</script>',
    ].join('')
    const hashes = collectInlineHashes(html, empty())
    expect([...hashes.scripts]).toEqual([hash('console.log(1)')])
    expect([...hashes.styles]).toEqual([hash('a{color:red}')])
  })

  it('deduplicates across pages', () => {
    const hashes = empty()
    collectInlineHashes('<script>x()</script>', hashes)
    collectInlineHashes('<script>x()</script>', hashes)
    expect(hashes.scripts.size).toBe(1)
  })

  it('rejects inline handlers and style attributes', () => {
    expect(() => collectInlineHashes('<button onclick="x()">', empty())).toThrow(/event handlers/)
    expect(() => collectInlineHashes('<div style="color:red">', empty())).toThrow(/style attr/)
  })
})

describe('addHashesToHeaders', () => {
  it('appends hashes to script-src and style-src only', () => {
    const headers = [
      '/*',
      "  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'",
      '  X-Frame-Options: DENY',
    ].join('\n')
    const result = addHashesToHeaders(headers, {
      scripts: new Set(["'sha256-b'", "'sha256-a'"]),
      styles: new Set(["'sha256-c'"]),
    })
    expect(result).toBe(
      [
        '/*',
        "  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-a' 'sha256-b'; style-src 'self' 'sha256-c'",
        '  X-Frame-Options: DENY',
      ].join('\n'),
    )
  })

  it('leaves the policy unchanged when there is nothing inline', () => {
    const headers = "  Content-Security-Policy: script-src 'self'"
    expect(addHashesToHeaders(headers, empty())).toBe(headers)
  })
})
