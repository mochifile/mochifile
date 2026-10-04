import { describe, expect, it } from 'vitest'
import { formatNotices, readNotice, SHIPPED } from './third-party-licenses.ts'

describe('third-party notices', () => {
  it('finds a license text for every shipped package', () => {
    for (const entry of SHIPPED) {
      const notice = readNotice(entry)
      expect(notice.version).toMatch(/^\d+\.\d+\.\d+/)
      for (const { text } of notice.texts) expect(text.length).toBeGreaterThan(100)
    }
  })

  it('includes the native codec notices that binary redistribution requires', () => {
    const text = formatNotices(SHIPPED.map((entry) => readNotice(entry)))
    expect(text).toContain('Independent JPEG Group') // mozjpeg / libjpeg-turbo
    expect(text).toContain('Copyright (c) 2010, Google Inc.') // libwebp
    expect(text).toContain('Joshua Holmer') // oxipng
    expect(text).toContain('@jsquash/resize')
    expect(text).toContain('client-zip')
  })

  it('meets the LGPL for the HEIC decoder: license, copyright lines and exact sources (ADR 0022)', () => {
    const text = formatNotices(SHIPPED.map((entry) => readNotice(entry)))
    expect(text).toContain('GNU LESSER GENERAL PUBLIC LICENSE')
    expect(text).toContain('Copyright (c) 2013-2014 struktur AG, Dirk Farin') // libde265
    expect(text).toContain('Copyright (c) 2017-2025 Dirk Farin') // libheif
    expect(text).toContain('https://github.com/strukturag/libheif/tree/v1.23.2')
    expect(text).toContain('https://github.com/strukturag/libde265/tree/v1.0.15')
    expect(text).toContain('libheif.wasm is served unmodified')
  })

  it('includes the AVIF decoder licenses, which its package does not ship', () => {
    const text = formatNotices(SHIPPED.map((entry) => readNotice(entry)))
    expect(text).toContain('Copyright 2019 Joe Drago') // libavif
    expect(text).toContain('Copyright (c) 2016, Alliance for Open Media') // libaom
    expect(text).toContain('Alliance for Open Media Patent License 1.0')
  })
})
