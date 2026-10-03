import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  addHashesToHeaders,
  assertHeaderLineLengths,
  collectInlineHashes,
  type InlineHashes,
  MAX_HEADER_LINE_LENGTH,
} from './csp-hashes.ts'

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

  // Regressions for CodeQL js/bad-tag-filter: inline code is found with an HTML parser, so the
  // hashes match what browsers parse, not what a regex happens to match.
  it('handles end tags with whitespace like </script >', () => {
    const hashes = collectInlineHashes(
      '<script>a()</script ><p>x</p><script>b()</script\t>',
      empty(),
    )
    expect([...hashes.scripts].sort()).toEqual([hash('a()'), hash('b()')].sort())
  })

  it('ignores tags and attributes inside HTML comments', () => {
    const html = [
      '<!-- <script>commented()</script> <style>x{}</style> -->',
      '<!-- <button onclick="x()" style="color:red"> -->',
      '<script>live()</script>',
    ].join('')
    const hashes = collectInlineHashes(html, empty())
    expect([...hashes.scripts]).toEqual([hash('live()')])
    expect(hashes.styles.size).toBe(0)
  })

  it('hashes every inline script and style in a document', () => {
    const html = [
      '<html><head><style>a{}</style><script>one()</script></head>',
      '<body><script type="module">two()</script><style>b{}</style>',
      '<template><script>three()</script></template></body></html>',
    ].join('')
    const hashes = collectInlineHashes(html, empty())
    expect([...hashes.scripts].sort()).toEqual(
      [hash('one()'), hash('two()'), hash('three()')].sort(),
    )
    expect([...hashes.styles].sort()).toEqual([hash('a{}'), hash('b{}')].sort())
  })

  it('hashes the exact text between the tags, including whitespace', () => {
    const hashes = collectInlineHashes('<script>\n  run()\n</script>', empty())
    expect([...hashes.scripts]).toEqual([hash('\n  run()\n')])
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
    expect(() => collectInlineHashes('<svg><g onload="x()"></g></svg>', empty())).toThrow(
      /event handlers/,
    )
  })

  it('does not mistake attributes that merely start with "on" text for handlers', () => {
    expect(() => collectInlineHashes('<p data-onboarding="1">on="x"</p>', empty())).not.toThrow()
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

describe('assertHeaderLineLengths', () => {
  it('accepts lines up to the Cloudflare limit', () => {
    const line = `  Content-Security-Policy: ${'a'.repeat(MAX_HEADER_LINE_LENGTH - 27)}`
    expect(line).toHaveLength(MAX_HEADER_LINE_LENGTH)
    expect(() => assertHeaderLineLengths(`/*\n${line}\n`)).not.toThrow()
  })

  it('rejects a line Cloudflare would ignore', () => {
    const line = `  Content-Security-Policy: ${'a'.repeat(MAX_HEADER_LINE_LENGTH)}`
    expect(() => assertHeaderLineLengths(`/*\n${line}\n`)).toThrow(/Content-Security-Policy/)
  })
})
