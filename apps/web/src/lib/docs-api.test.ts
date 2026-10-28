import { describe, expect, it } from 'vitest'
import {
  API_BASE_URL,
  compressExample,
  convertExample,
  exampleLanguages,
  highlightCode,
  inlineCode,
  jobsExample,
  mergeExample,
} from './docs-api.ts'

describe('highlightCode', () => {
  it('wraps comments and strings, and escapes everything', () => {
    expect(highlightCode('# a <b>\ncurl "x&y" -o f')).toBe(
      '<span class="code-c"># a &lt;b&gt;</span>\ncurl <span class="code-s">&quot;x&amp;y&quot;</span> -o f',
    )
    expect(highlightCode("// c\nfetch('u')")).toBe(
      '<span class="code-c">// c</span>\nfetch(<span class="code-s">\'u\'</span>)',
    )
  })

  it('does not take the // of a URL inside a string for a comment', () => {
    expect(highlightCode('"https://a.b/c"')).toBe(
      '<span class="code-s">&quot;https://a.b/c&quot;</span>',
    )
  })

  it('leaves no markup of the input alive', () => {
    expect(highlightCode('<script>alert(1)</script>')).not.toContain('<script>')
  })
})

describe('inlineCode', () => {
  it('turns backticks into code and escapes the rest', () => {
    expect(inlineCode('Use `a<b` or <i>')).toBe('Use <code>a&lt;b</code> or &lt;i&gt;')
    expect(inlineCode('plain')).toBe('plain')
  })
})

describe('the examples', () => {
  const all = [compressExample('c'), convertExample('c'), mergeExample('c'), jobsExample]

  it('have every language, and only the planned base URL', () => {
    for (const example of all) {
      for (const { key } of exampleLanguages) expect(example[key].length).toBeGreaterThan(20)
      for (const key of ['curl', 'js', 'python'] as const) {
        const hosts = example[key].match(/https?:\/\/[^/'"\s]+/g) ?? []
        for (const host of hosts) expect(host).toBe(API_BASE_URL)
      }
    }
  })

  it('never contain a real-looking key', () => {
    for (const example of all) {
      for (const code of Object.values(example)) expect(code).not.toMatch(/mf_(live|test)_|sk-/)
    }
  })

  it('start with the translated comment where there is one', () => {
    expect(compressExample('Hello').curl.startsWith('# Hello\n')).toBe(true)
    expect(compressExample('Hello').js.startsWith('// Hello\n')).toBe(true)
    expect(compressExample('Hello').python.startsWith('# Hello\n')).toBe(true)
  })
})
