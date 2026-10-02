import { describe, expect, it } from 'vitest'
import { deserializeError, serializeError, ToolError, throwIfAborted } from './errors.ts'

describe('error serialization', () => {
  it('round-trips ToolError codes', () => {
    const error = deserializeError(serializeError(new ToolError('file-too-large', 'too big')))
    expect(error).toBeInstanceOf(ToolError)
    expect(error.code).toBe('file-too-large')
    expect(error.message).toBe('too big')
  })

  it('maps AbortError to the aborted code', () => {
    expect(serializeError(new DOMException('x', 'AbortError')).code).toBe('aborted')
  })

  it('hides details of unexpected errors', () => {
    expect(serializeError(new Error('secret internal detail'))).toEqual({
      code: 'processing-failed',
      message: 'Processing failed',
    })
  })
})

describe('throwIfAborted', () => {
  it('throws only once the signal is aborted', () => {
    const controller = new AbortController()
    expect(() => throwIfAborted(controller.signal)).not.toThrow()
    controller.abort()
    expect(() => throwIfAborted(controller.signal)).toThrow(ToolError)
  })
})
