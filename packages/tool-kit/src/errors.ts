export const toolErrorCodes = [
  'unsupported-type',
  'file-too-large',
  'too-many-files',
  'total-too-large',
  'no-files',
  'aborted',
  'processing-failed',
  /** The file claims a supported type but cannot be read (corrupt or truncated). */
  'invalid-file',
  /** The file's pixel dimensions exceed what the tool can process. */
  'dimensions-too-large',
  /** The requested result cannot be reached, e.g. a size target that is too small. */
  'target-unreachable',
] as const
export type ToolErrorCode = (typeof toolErrorCodes)[number]

/**
 * Extra facts the UI can show with an error, e.g. `{ smallestBytes: 7200 }`. Plain numbers
 * and strings only, and never file contents, file names or anything derived from pixels.
 */
export type ToolErrorDetails = Readonly<Record<string, number | string>>

export interface ToolErrorOptions extends ErrorOptions {
  details?: ToolErrorDetails
}

/**
 * An expected, user-facing failure. The UI maps `code` (and `details`) to a translated
 * message, so `message` is for developers only. Never put file contents in any field.
 */
export class ToolError extends Error {
  override readonly name = 'ToolError'
  readonly code: ToolErrorCode
  readonly details: ToolErrorDetails | undefined

  constructor(code: ToolErrorCode, message: string = code, options?: ToolErrorOptions) {
    super(message, options)
    this.code = code
    this.details = options?.details
  }
}

export function isToolError(error: unknown): error is ToolError {
  return error instanceof ToolError
}

/** Serializable shape used to send a `ToolError` across the worker boundary. */
export interface SerializedToolError {
  code: ToolErrorCode
  message: string
  details?: ToolErrorDetails
}

export function serializeError(error: unknown): SerializedToolError {
  if (isToolError(error)) {
    return error.details === undefined
      ? { code: error.code, message: error.message }
      : { code: error.code, message: error.message, details: { ...error.details } }
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'aborted', message: 'Aborted' }
  }
  // Unknown errors are reduced to a generic code so internals never reach the UI.
  return { code: 'processing-failed', message: 'Processing failed' }
}

export function deserializeError(error: SerializedToolError): ToolError {
  return error.details === undefined
    ? new ToolError(error.code, error.message)
    : new ToolError(error.code, error.message, { details: error.details })
}

/** Throws `ToolError('aborted')` if the signal was aborted. Call it inside long loops. */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new ToolError('aborted', 'Aborted')
}
