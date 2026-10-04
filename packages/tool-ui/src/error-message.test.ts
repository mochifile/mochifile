import { describe, expect, it } from 'vitest'
import { type ErrorMessages, errorMessage } from './error-message.ts'

const messages: ErrorMessages = {
  unsupportedType: () => 'unsupported',
  fileTooLarge: () => 'too large',
  invalidFile: () => 'invalid',
  dimensionsTooLarge: (max) => `over ${max} MP`,
  targetUnreachable: (smallest) => `smallest ${smallest}`,
  generic: () => 'try again',
}

describe('errorMessage', () => {
  it('uses structured details for the two errors that need numbers', () => {
    expect(
      errorMessage({ code: 'dimensions-too-large', details: { maxMegapixels: 24 } }, messages),
    ).toBe('over 24 MP')
    expect(
      errorMessage({ code: 'target-unreachable', details: { smallestBytes: 7000 } }, messages),
    ).toBe('smallest 7000')
  })

  it('keeps unexpected failures on the safe generic message', () => {
    expect(errorMessage({ code: 'unknown', details: undefined }, messages)).toBe('try again')
    expect(errorMessage({ code: 'processing-failed', details: undefined }, messages)).toBe(
      'try again',
    )
  })
})
