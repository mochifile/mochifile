import type { ToolManifest } from '@mochifile/tool-kit'
import { manifest as templateManifest } from '@mochifile/tool-template/manifest'
import { describe, expect, it } from 'vitest'
import {
  accountLinks,
  companyLinks,
  footerColumns,
  footerPills,
  isCurrent,
  mainLinks,
  shellLanguages,
  toolHref,
} from './site-nav.ts'
import type { RegisteredTool } from './tools.ts'

/** A `compress-image` stand-in with a main page and a `50kb` variant. */
const compress: RegisteredTool = {
  dir: 'compress-image',
  manifest: {
    ...templateManifest,
    id: 'compress-image',
    meta: {
      en: { ...templateManifest.meta.en, slug: 'compress-image' },
      pt: { ...templateManifest.meta.pt, slug: 'comprimir-imagem' },
    },
    variants: [
      {
        key: '50kb',
        options: {},
        meta: {
          en: { ...templateManifest.meta.en, slug: 'compress-image-to-50kb' },
          pt: { ...templateManifest.meta.pt, slug: 'comprimir-imagem-para-50kb' },
        },
      },
    ],
  } as ToolManifest,
}

describe('site shell links', () => {
  it('lists the canvas navigation in order, each linked to its page', () => {
    expect(mainLinks('en').map((link) => [link.label, link.href])).toEqual([
      ['Solutions', '/solutions/'],
      ['Guides', '/guides/'],
      ['Docs', '/docs/'],
      ['Pricing', '/pricing/'],
    ])
    expect(mainLinks('pt').map((link) => link.href)).toEqual([
      '/pt/solucoes/',
      '/pt/guias/',
      '/pt/docs/',
      '/pt/precos/',
    ])
    const { signIn, getStarted } = accountLinks('en')
    expect([signIn.label, getStarted.label]).toEqual(['Sign in', 'Get started'])
    expect([signIn.href, getStarted.href]).toEqual(['/sign-in/', '/sign-up/'])
    expect(accountLinks('pt').signIn.href).toBe('/pt/entrar/')
  })

  it('links the company pages that exist and leaves the legal ones as "Coming soon"', () => {
    const company = Object.fromEntries(companyLinks('en').map((link) => [link.key, link.href]))
    expect(company).toEqual({
      about: '/about/',
      contact: '/contact/',
      sustainability: '/sustainability/',
      architecture: '/architecture/',
      'terms-of-service': undefined,
      'privacy-policy': undefined,
      'terms-conditions': undefined,
      dpa: undefined,
    })
    expect(footerPills('pt').guides.href).toBe('/pt/guias/')
  })

  it('marks the page and its section as current', () => {
    expect(isCurrent('/guides/', '/guides/heic-vs-jpg/')).toBe(true)
    expect(isCurrent('/pricing/', '/pricing/')).toBe(true)
    expect(isCurrent('/pricing/', '/guides/')).toBe(false)
    expect(isCurrent(undefined, '/')).toBe(false)
  })

  it('translates the labels', () => {
    expect(mainLinks('pt').map((link) => link.label)).toEqual([
      'Soluções',
      'Guias',
      'Docs',
      'Preços',
    ])
    expect(companyLinks('pt')[0]?.label).toBe('Sobre')
  })

  it("links a tool's pages only when the registry has them", () => {
    expect(toolHref([compress], 'compress-image', 'index', 'en')).toBe('/compress-image/')
    expect(toolHref([compress], 'compress-image', '50kb', 'pt')).toBe(
      '/pt/comprimir-imagem-para-50kb/',
    )
    expect(toolHref([], 'compress-image', 'index', 'en')).toBeUndefined()
    expect(toolHref([compress], 'compress-image', '20kb', 'en')).toBeUndefined()
  })

  it('shows the canvas footer columns, linking only the tool pages that exist', () => {
    const [popular, video, install] = footerColumns('en', [compress])
    expect(popular?.links.map((link) => [link.label, link.href])).toEqual([
      ['Compress image', '/compress-image/'],
      ['Compress to 50 KB', '/compress-image-to-50kb/'],
      ['HEIC to JPG', undefined],
      ['WebP to JPG', undefined],
      ['Images to PDF', undefined],
    ])
    expect(video?.links.map((link) => link.label)).toEqual(['MP4 to WebM', 'WebM to MP4'])
    expect(install?.links.map((link) => link.label)).toEqual([
      'Chrome extension',
      'CLI and MCP server',
      'API docs',
    ])
    // With no tools published, nothing in the column is linked, and nothing is hidden.
    expect(footerColumns('en', [])[0]?.links).toHaveLength(5)
    expect(footerColumns('en', [])[0]?.links.every((link) => link.href === undefined)).toBe(true)
  })

  it('offers the six languages, English first, with pages only for English and Portuguese', () => {
    expect(shellLanguages.map((language) => language.name)).toEqual([
      'English',
      'Português (Brasil)',
      'Español',
      'Français',
      'हिन्दी',
      '简体中文',
    ])
    expect(shellLanguages.filter((language) => language.locale).map((l) => l.locale)).toEqual([
      'en',
      'pt',
    ])
  })
})
