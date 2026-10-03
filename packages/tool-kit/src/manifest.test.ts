import { describe, expect, it } from 'vitest'
import { assertUniqueTools, defineToolManifest, validateManifest } from './manifest.ts'
import { validManifest } from './test-fixtures.ts'

const variant = (key: string, enSlug: string, ptSlug: string, options = { quality: 50 }) => ({
  key,
  options,
  meta: {
    en: { slug: enSlug, title: 'Example at 50', description: 'Starts at quality 50.' },
    pt: { slug: ptSlug, title: 'Exemplo a 50', description: 'Começa com qualidade 50.' },
  },
})

describe('defineToolManifest', () => {
  it('returns a frozen copy of a valid manifest', () => {
    const manifest = defineToolManifest(validManifest)
    expect(manifest).toEqual(validManifest)
    expect(manifest).not.toBe(validManifest)
    expect(Object.isFrozen(manifest.meta.en)).toBe(true)
  })

  it('throws with every problem listed', () => {
    expect(() => defineToolManifest({ ...validManifest, id: 'Bad Id', accepts: ['nope'] })).toThrow(
      /id must be lowercase kebab-case[\s\S]*invalid MIME type "nope"/,
    )
  })
})

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    expect(validateManifest(validManifest)).toEqual([])
  })

  it('rejects bad slugs, long titles and long descriptions', () => {
    const problems = validateManifest({
      ...validManifest,
      meta: {
        en: { slug: 'Not_Kebab', title: 'x'.repeat(71), description: 'y'.repeat(161) },
        pt: validManifest.meta.pt,
      },
    })
    expect(problems).toEqual([
      'meta.en.slug must be lowercase kebab-case',
      'meta.en.title exceeds 70 chars',
      'meta.en.description exceeds 160 chars',
    ])
  })

  it('rejects invalid limits', () => {
    const problems = validateManifest({
      ...validManifest,
      limits: { maxFiles: 0, maxFileSizeBytes: 0, maxTotalSizeBytes: -1 },
    })
    expect(problems).toHaveLength(3)
  })

  it('rejects defaults that cannot be posted to a worker', () => {
    const problems = validateManifest({ ...validManifest, defaults: { fn: () => 1 } })
    expect(problems).toContain('defaults must be structured-cloneable plain data')
  })
})

describe('variants', () => {
  it('accepts valid variants', () => {
    const manifest = {
      ...validManifest,
      variants: [variant('q50', 'example-tool-50', 'ferramenta-exemplo-50')],
    }
    expect(validateManifest(manifest)).toEqual([])
    expect(Object.isFrozen(defineToolManifest(manifest).variants?.[0]?.options)).toBe(true)
  })

  it('rejects bad keys, the reserved key, duplicate keys and unknown options', () => {
    const problems = validateManifest({
      ...validManifest,
      variants: [
        variant('Bad Key', 'a-en', 'a-pt'),
        variant('index', 'b-en', 'b-pt'),
        variant('q50', 'c-en', 'c-pt'),
        variant('q50', 'd-en', 'd-pt', { quality: 50, speed: 2 } as { quality: number }),
      ],
    })
    expect(problems).toEqual([
      'variants[0].key must be lowercase kebab-case',
      'variants[1].key "index" is reserved',
      'variants[3].key "q50" is used twice',
      'variants[3].options.speed is not in defaults',
    ])
  })

  it('validates variant metadata like the main page', () => {
    const bad = variant('q50', 'Not_Kebab', 'ok-pt')
    bad.meta.en.title = 'x'.repeat(71)
    expect(validateManifest({ ...validManifest, variants: [bad] })).toEqual([
      'variants[0].meta.en.slug must be lowercase kebab-case',
      'variants[0].meta.en.title exceeds 70 chars',
    ])
  })
})

describe('relatedPagesLabel', () => {
  it('accepts a label in every locale', () => {
    const manifest = {
      ...validManifest,
      relatedPagesLabel: { en: 'Other sizes', pt: 'Outros tamanhos' },
    }
    expect(validateManifest(manifest)).toEqual([])
  })

  it('rejects empty and long labels', () => {
    const manifest = { ...validManifest, relatedPagesLabel: { en: ' ', pt: 'x'.repeat(41) } }
    expect(validateManifest(manifest)).toEqual([
      'relatedPagesLabel.en is empty',
      'relatedPagesLabel.pt exceeds 40 chars',
    ])
  })
})

describe('assertUniqueTools', () => {
  it('passes for distinct tools', () => {
    const other = {
      ...validManifest,
      id: 'other-tool',
      meta: {
        en: { ...validManifest.meta.en, slug: 'other-tool' },
        pt: { ...validManifest.meta.pt, slug: 'outra-ferramenta' },
      },
    }
    expect(() => assertUniqueTools([validManifest, other])).not.toThrow()
  })

  it('throws on duplicate ids', () => {
    expect(() => assertUniqueTools([validManifest, validManifest])).toThrow(/Duplicate tool id/)
  })

  it('throws on duplicate slugs within a locale', () => {
    const other = { ...validManifest, id: 'other-tool' }
    expect(() => assertUniqueTools([validManifest, other])).toThrow(/Slug "en:example-tool"/)
  })
})

describe('assertUniqueTools with variants', () => {
  it('throws when a variant reuses its own tool slug', () => {
    const manifest = {
      ...validManifest,
      variants: [variant('q50', 'example-tool', 'ferramenta-exemplo-50')],
    }
    expect(() => assertUniqueTools([manifest])).toThrow(
      /Slug "en:example-tool" used by both "example-tool" and "example-tool\/q50"/,
    )
  })

  it("throws when a variant reuses another tool's slug in the same locale", () => {
    const other = {
      ...validManifest,
      id: 'other-tool',
      meta: {
        en: { ...validManifest.meta.en, slug: 'other-tool' },
        pt: { ...validManifest.meta.pt, slug: 'outra-ferramenta' },
      },
      variants: [variant('q50', 'other-50', 'ferramenta-exemplo')],
    }
    expect(() => assertUniqueTools([validManifest, other])).toThrow(/Slug "pt:ferramenta-exemplo"/)
  })
})
