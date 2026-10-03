import { describe, expect, it } from 'vitest'
import { shouldPreloadOnIdle } from './preload-policy.ts'

describe('shouldPreloadOnIdle', () => {
  it('preloads when the Network Information API is missing (Safari, Firefox)', () => {
    expect(shouldPreloadOnIdle({})).toBe(true)
  })

  it('preloads on fast connections', () => {
    expect(shouldPreloadOnIdle({ connection: { effectiveType: '4g', saveData: false } })).toBe(true)
    expect(shouldPreloadOnIdle({ connection: { effectiveType: '3g' } })).toBe(true)
  })

  it('does not preload when the visitor asked to save data', () => {
    expect(shouldPreloadOnIdle({ connection: { effectiveType: '4g', saveData: true } })).toBe(false)
  })

  it('does not preload on 2g or slow-2g', () => {
    expect(shouldPreloadOnIdle({ connection: { effectiveType: '2g' } })).toBe(false)
    expect(shouldPreloadOnIdle({ connection: { effectiveType: 'slow-2g' } })).toBe(false)
  })
})
