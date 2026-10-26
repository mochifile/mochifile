import {
  defineToolManifest,
  type ToolCategory,
  type ToolLocaleMeta,
  type ToolManifest,
} from '@mochifile/tool-kit'
import { manifest as templateManifest } from '@mochifile/tool-template/manifest'
import { describe, expect, it } from 'vitest'
import {
  allToolsInBrowser,
  formatTarget,
  homeToolGroups,
  START_TARGETS,
  START_TOOL_ID,
  startCard,
} from './home.ts'
import { type RegisteredTool, tools } from './tools.ts'

const meta = (slug: string): Record<'en' | 'pt', ToolLocaleMeta> => ({
  en: { slug, title: `Title ${slug}`, description: 'Description.', tagline: 'Tagline.' },
  pt: { slug: `pt-${slug}`, title: `Título ${slug}`, description: 'Descrição.', tagline: 'Frase.' },
})

/** A registered tool with size variants at the given targets, in the given order. */
function sizeTool(id: string, targets: number[], category: ToolCategory = 'image'): RegisteredTool {
  const manifest = defineToolManifest({
    id,
    category,
    runtime: 'browser',
    accepts: ['image/jpeg'],
    limits: { maxFiles: 1, maxFileSizeBytes: 1_000 },
    defaults: { targetBytes: 100_000 },
    meta: meta(id),
    variants: targets.map((bytes) => ({
      key: `${bytes}b`,
      options: { targetBytes: bytes },
      meta: meta(`${id}-${bytes}`),
    })),
  })
  return { dir: id, manifest: manifest as ToolManifest }
}

const template: RegisteredTool = { dir: '_template', manifest: templateManifest }

describe('formatTarget', () => {
  it('writes sizes the way forms do, with the locale decimal separator', () => {
    expect(formatTarget(50_000, 'en')).toBe('50 KB')
    expect(formatTarget(1_000_000, 'pt')).toBe('1 MB')
    expect(formatTarget(1_500_000, 'en')).toBe('1.5 MB')
    expect(formatTarget(1_500_000, 'pt')).toBe('1,5 MB')
  })
})

describe('startCard', () => {
  it('uses the real compression manifest: its main page and its size variants', () => {
    const compress = tools.find(({ manifest }) => manifest.id === START_TOOL_ID)
    if (!compress) throw new Error('compress-image is not registered')
    const variants = compress.manifest.variants ?? []

    for (const locale of ['en', 'pt'] as const) {
      const card = startCard(tools, locale)
      expect(card?.href).toBe(locale === 'en' ? '/compress-image/' : '/pt/comprimir-imagem/')
      expect(card?.featured.map((size) => size.label)).toEqual(['50 KB', '100 KB', '200 KB'])
      expect(card?.others.map((size) => size.label)).toEqual(['20 KB', '500 KB', '1 MB'])
      // Every link is a variant page of the manifest, each listed once.
      const links = [...(card?.featured ?? []), ...(card?.others ?? [])]
      expect(links.map((size) => size.href).sort()).toEqual(
        variants
          .map((variant) =>
            locale === 'en' ? `/${variant.meta.en.slug}/` : `/pt/${variant.meta.pt.slug}/`,
          )
          .sort(),
      )
      for (const size of links) {
        const variant = variants.find((each) => each.options.targetBytes === size.bytes)
        expect(size.title).toBe(variant?.meta[locale].title)
      }
    }
  })

  it('shows only the featured sizes the manifest has, in the featured order', () => {
    const card = startCard([sizeTool(START_TOOL_ID, [200_000, 20_000, 50_000])], 'en')
    expect(card?.featured.map((size) => size.bytes)).toEqual([50_000, 200_000])
    expect(card?.featured.map((size) => size.href)).toEqual([
      `/${START_TOOL_ID}-50000/`,
      `/${START_TOOL_ID}-200000/`,
    ])
    expect(card?.others.map((size) => size.bytes)).toEqual([20_000])
  })

  it('lists other sizes smallest first', () => {
    const card = startCard([sizeTool(START_TOOL_ID, [900_000, 10_000, 300_000])], 'pt')
    expect(card?.featured).toEqual([])
    expect(card?.others.map((size) => size.label)).toEqual(['10 KB', '300 KB', '900 KB'])
  })

  it('keeps the card, with no size links, when the tool has no size variants', () => {
    const card = startCard([sizeTool(START_TOOL_ID, [])], 'en')
    expect(card?.href).toBe(`/${START_TOOL_ID}/`)
    expect(card?.featured).toEqual([])
    expect(card?.others).toEqual([])
  })

  it('ignores variants that do not preset a target size', () => {
    const card = startCard(
      [{ ...template, manifest: { ...template.manifest, id: START_TOOL_ID } }],
      'en',
    )
    expect(card?.featured).toEqual([])
    expect(card?.others).toEqual([])
  })

  it('is left out when the start tool is not published', () => {
    expect(startCard([template], 'en')).toBeNull()
    expect(startCard([], 'pt')).toBeNull()
  })

  it('features 50, 100 and 200 KB', () => {
    expect(START_TARGETS).toEqual([50_000, 100_000, 200_000])
  })
})

describe('homeToolGroups', () => {
  it('has a single group with one tool', () => {
    const one = sizeTool('one', [])
    expect(homeToolGroups([one])).toEqual([{ category: 'image', tools: [one] }])
  })

  it('keeps tools of the same category together, in registry order', () => {
    const a = sizeTool('b-tool', [])
    const b = sizeTool('a-tool', [])
    expect(homeToolGroups([a, b])).toEqual([{ category: 'image', tools: [a, b] }])
  })

  it('has one group per category with a tool, in the contract order, and no empty group', () => {
    const pdf = sizeTool('pdf-tool', [], 'pdf')
    const image = sizeTool('image-tool', [], 'image')
    const groups = homeToolGroups([pdf, image])
    expect(groups.map((group) => group.category)).toEqual(['image', 'pdf'])
    expect(groups.every((group) => group.tools.length > 0)).toBe(true)
  })

  it('is empty with no tools', () => {
    expect(homeToolGroups([])).toEqual([])
  })
})

describe('allToolsInBrowser', () => {
  it('is true only when there are tools and all of them run in the browser', () => {
    expect(allToolsInBrowser([template])).toBe(true)
    expect(allToolsInBrowser([])).toBe(false)
    const server = { ...template, manifest: { ...template.manifest, runtime: 'server' as const } }
    expect(allToolsInBrowser([template, server])).toBe(false)
  })
})
