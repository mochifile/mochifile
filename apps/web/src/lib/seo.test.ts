import { describe, expect, it } from 'vitest'
import { buildAlternates, samePathInAllLocales, serializeJsonLd, toolJsonLd } from './seo.ts'

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

describe('toolJsonLd', () => {
  const data = toolJsonLd({
    name: 'Compress image to 50 KB',
    description: 'Shrink a photo to under 50 KB.',
    url: 'https://mochifile.com/compress-image-to-50kb/',
    locale: 'pt',
    category: 'image',
    breadcrumbs: [
      { name: 'Mochifile', url: 'https://mochifile.com/pt/' },
      { name: 'Comprimir imagem', url: 'https://mochifile.com/pt/comprimir-imagem/' },
    ],
  })
  const [app, breadcrumbs] = data['@graph'] as Array<Record<string, unknown>>

  it('describes a free web application in the page language', () => {
    expect(app).toMatchObject({
      '@type': 'WebApplication',
      name: 'Compress image to 50 KB',
      url: 'https://mochifile.com/compress-image-to-50kb/',
      inLanguage: 'pt',
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Any',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    })
  })

  it('numbers breadcrumbs from 1', () => {
    expect(breadcrumbs).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Mochifile', item: 'https://mochifile.com/pt/' },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Comprimir imagem',
          item: 'https://mochifile.com/pt/comprimir-imagem/',
        },
      ],
    })
  })
})

describe('serializeJsonLd', () => {
  it('cannot close the script element and still parses back', () => {
    const value = { name: '</script><script>alert(1)</script> & co' }
    const json = serializeJsonLd(value)
    expect(json).not.toMatch(/[<>&]/)
    expect(JSON.parse(json)).toEqual(value)
  })
})
