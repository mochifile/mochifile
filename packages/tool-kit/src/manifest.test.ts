import { describe, expect, it } from 'vitest'
import { assertUniqueTools, defineToolManifest, validateManifest } from './manifest.ts'
import { validManifest } from './test-fixtures.ts'

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
