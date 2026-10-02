export const toolErrorCodes = [
  'unsupported-type',
  'file-too-large',
  'too-many-files',
  'total-too-large',
  'no-files',
  'aborted',
  'processing-failed',
] as const
export type ToolErrorCode = (typeof toolErrorCodes)[number]

/**
 * An expected, user-facing failure. The UI maps `code` to a translated message, so
 * `message` is for developers only. Never put file contents in either field.
 */
export class ToolError extends Error {
  override readonly name = 'ToolError'
  readonly code: ToolErrorCode

  constructor(code: ToolErrorCode, message: string = code, options?: ErrorOptions) {
    super(message, options)
    this.code = code
  }
}

export function isToolError(error: unknown): error is ToolError {
  return error instanceof ToolError
}

/** Serializable shape used to send a `ToolError` across the worker boundary. */
export interface SerializedToolError {
  code: ToolErrorCode
  message: string
}

export function serializeError(error: unknown): SerializedToolError {
  if (isToolError(error)) return { code: error.code, message: error.message }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'aborted', message: 'Aborted' }
  }
  // Unknown errors are reduced to a generic code so internals never reach the UI.
  return { code: 'processing-failed', message: 'Processing failed' }
}

export function deserializeError(error: SerializedToolError): ToolError {
  return new ToolError(error.code, error.message)
}

/** Throws `ToolError('aborted')` if the signal was aborted. Call it inside long loops. */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new ToolError('aborted', 'Aborted')
}
