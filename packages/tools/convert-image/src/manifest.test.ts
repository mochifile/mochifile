import { describe, expect, it } from 'vitest'
import { manifest } from './manifest.ts'

describe('convert-image manifest', () => {
  it('has the six variant pages, each presetting its output', () => {
    expect(manifest.variants?.map((v) => [v.key, v.options.format])).toEqual([
      ['heic-to-jpg', 'jpeg'],
      ['webp-to-jpg', 'jpeg'],
      ['png-to-jpg', 'jpeg'],
      ['jpg-to-png', 'png'],
      ['webp-to-png', 'png'],
      ['jpg-to-webp', 'webp'],
    ])
  })

  it('uses readable slugs in both languages', () => {
    expect(manifest.meta.en.slug).toBe('convert-image')
    expect(manifest.meta.pt.slug).toBe('converter-imagem')
    expect(manifest.variants?.[0]?.meta.en.slug).toBe('heic-to-jpg')
    expect(manifest.variants?.[0]?.meta.pt.slug).toBe('heic-para-jpg')
  })

  it('accepts HEIC and AVIF besides the web formats, and defaults to JPG', () => {
    expect(manifest.accepts).toEqual(
      expect.arrayContaining(['image/heic', 'image/heif', 'image/avif', 'image/jpeg']),
    )
    expect(manifest.defaults).toEqual({ format: 'jpeg' })
  })
})
