import { describe, expect, it } from 'vitest'
import { buildAlternates, samePathInAllLocales } from './seo.ts'

describe('buildAlternates', () => {
  it('emits one absolute link per locale plus x-default pointing to English', () => {
    expect(buildAlternates(samePathInAllLocales('/'), 'https://mochifile.com')).toEqual([
      { hreflang: 'en', href: 'https://mochifile.com/' },
      { hreflang: 'pt', href: 'https://mochifile.com/pt/' },
      { hreflang: 'x-default', href: 'https://mochifile.com/' },
    ])
  })

  it('supports per-locale slugs', () => {
    const links = buildAlternates(
      { en: '/compress-image/', pt: '/pt/comprimir-imagem/' },
      new URL('https://mochifile.com'),
    )
    expect(links.map((link) => link.href)).toEqual([
      'https://mochifile.com/compress-image/',
      'https://mochifile.com/pt/comprimir-imagem/',
      'https://mochifile.com/compress-image/',
    ])
  })
})
