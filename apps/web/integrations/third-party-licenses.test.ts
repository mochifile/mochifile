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
})
