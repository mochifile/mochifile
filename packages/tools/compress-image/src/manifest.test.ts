import { describe, expect, it } from 'vitest'
import { manifest } from './manifest.ts'
import { PRESETS } from './sizes.ts'

describe('compress-image manifest', () => {
  it('has one variant page per preset, in order', () => {
    expect(manifest.variants?.map((v) => [v.key, v.options.targetBytes])).toEqual(
      PRESETS.map((preset) => [preset.key, preset.bytes]),
    )
  })

  it('uses readable slugs in both languages', () => {
    expect(manifest.variants?.[1]?.meta.en.slug).toBe('compress-image-to-50kb')
    expect(manifest.variants?.[1]?.meta.pt.slug).toBe('comprimir-imagem-para-50kb')
  })

  it('accepts only the formats the engine handles', () => {
    expect(manifest.accepts).toEqual(['image/jpeg', 'image/png', 'image/webp'])
  })
})
