import { describe, expect, it } from 'vitest'
import { formatSize, MAX_TARGET, MIN_TARGET, parseTarget, sizeSuffix } from './sizes.ts'

describe('formatSize', () => {
  it('writes KB and MB the way forms do, in the locale', () => {
    expect(formatSize(50_000, 'en')).toBe('50 KB')
    expect(formatSize(48_765, 'en')).toBe('48 KB')
    expect(formatSize(7_250, 'pt')).toBe('7,2 KB')
    expect(formatSize(1_000_000, 'en')).toBe('1 MB')
    expect(formatSize(2_480_000, 'pt')).toBe('2,4 MB')
  })

  it('never rounds a size up past a limit', () => {
    // 49,999 bytes must not read as "50 KB" next to a 50 KB limit... nor as more.
    expect(formatSize(49_999, 'en')).toBe('49 KB')
    expect(formatSize(9_999, 'en')).toBe('9.9 KB')
  })
})

describe('sizeSuffix', () => {
  it('names outputs by target', () => {
    expect(sizeSuffix(50_000)).toBe('50kb')
    expect(sizeSuffix(1_000_000)).toBe('1mb')
    expect(sizeSuffix(1_500_000)).toBe('1.5mb')
    expect(sizeSuffix(75_500)).toBe('75.5kb')
  })
})

describe('parseTarget', () => {
  it('accepts whole and decimal numbers with a dot or a comma', () => {
    expect(parseTarget('75', 'kb')).toEqual({ ok: true, bytes: 75_000 })
    expect(parseTarget(' 1,5 ', 'mb')).toEqual({ ok: true, bytes: 1_500_000 })
    expect(parseTarget('2.25', 'mb')).toEqual({ ok: true, bytes: 2_250_000 })
  })

  it('rejects text, negatives and empty input', () => {
    for (const text of ['', 'abc', '-5', '1e3', '5 kb']) {
      expect(parseTarget(text, 'kb')).toEqual({ ok: false, reason: 'invalid' })
    }
  })

  it('keeps targets within range', () => {
    expect(parseTarget('4', 'kb')).toEqual({ ok: false, reason: 'out-of-range' })
    expect(parseTarget('21', 'mb')).toEqual({ ok: false, reason: 'out-of-range' })
    expect(parseTarget(String(MIN_TARGET / 1000), 'kb').ok).toBe(true)
    expect(parseTarget(String(MAX_TARGET / 1_000_000), 'mb').ok).toBe(true)
  })
})
