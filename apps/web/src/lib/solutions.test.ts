import { locales } from '@mochifile/i18n'
import { describe, expect, it } from 'vitest'
import { CATALOG, parseRich, richHref, solText, toolHref, toolTitle } from './solutions.ts'
import { tools } from './tools.ts'

const all = CATALOG.flatMap((category) => category.tools)

describe('the Solutions catalogue', () => {
  it('draws every tool of the canvas, once', () => {
    expect(all).toHaveLength(27)
    expect(new Set(all.map((entry) => entry.id)).size).toBe(all.length)
    expect(CATALOG.map((category) => category.id)).toEqual([
      'compress',
      'convert',
      'web',
      'product',
      'hdr',
      'pdf',
      'video',
    ])
  })

  it('has every text in every language', () => {
    for (const locale of locales) {
      for (const category of CATALOG) expect(solText(`cat_${category.id}`, locale)).not.toBe('')
      for (const entry of all) {
        const key = entry.id.replaceAll('-', '_')
        for (const part of ['title', 'text', 'pill']) {
          expect(solText(`t_${key}_${part}`, locale), `${entry.id} ${part}`).not.toBe('')
        }
      }
    }
  })

  it('links only to pages the registry publishes', () => {
    const live = all.filter((entry) => entry.live)
    expect(live.map((entry) => entry.id)).toEqual([
      'compress-image',
      'compress-50kb',
      'compress-100kb',
      'compress-200kb',
    ])
    expect(toolHref(tools, live[0] as (typeof all)[number], 'en')).toBe('/compress-image/')
    expect(toolHref(tools, live[1] as (typeof all)[number], 'pt')).toBe(
      '/pt/comprimir-imagem-para-50kb/',
    )
    const heic = all.find((entry) => entry.id === 'heic-jpg')
    expect(heic && toolHref(tools, heic, 'en')).toBeUndefined()
  })

  it('names the tools as the design does', () => {
    expect(toolTitle('compress-50kb', 'en')).toBe('Compress to 50 KB')
    expect(toolTitle('heic-jpg', 'pt')).toBe('HEIC para JPG')
  })
})

describe('parseRich', () => {
  it('splits text and links', () => {
    expect(parseRich('Use [[a-b|A to B]] or [[c|C]].')).toEqual([
      { text: 'Use ' },
      { id: 'a-b', label: 'A to B' },
      { text: ' or ' },
      { id: 'c', label: 'C' },
      { text: '.' },
    ])
  })

  it('keeps plain text whole', () => {
    expect(parseRich('No links.')).toEqual([{ text: 'No links.' }])
  })

  it('resolves tool links, and leaves unbuilt destinations without a path', () => {
    expect(richHref(tools, 'compress-image', 'en')).toBe('/compress-image/')
    expect(richHref(tools, 'ask', 'en')).toBeUndefined()
    expect(richHref(tools, 'hif-jpg', 'pt')).toBeUndefined()
  })

  it('every link in every message points at a known id or a known unbuilt destination', () => {
    const known = new Set([
      ...all.map((entry) => entry.id),
      'ask',
      'extension',
      'cli',
      'architecture',
    ])
    const keys = [
      ...[1, 2, 3, 4].flatMap((n) =>
        Array.from(
          { length: n === 1 ? 4 : n === 2 ? 3 : n === 3 ? 3 : 3 },
          (_, i) => `which_${n}_item_${i + 1}`,
        ),
      ),
      'lead',
      'about_1_text',
      'about_2_text',
    ]
    for (const locale of locales) {
      for (const key of keys) {
        for (const part of parseRich(solText(key, locale))) {
          if ('id' in part) expect(known.has(part.id), `${key} ${part.id}`).toBe(true)
        }
      }
    }
  })
})
