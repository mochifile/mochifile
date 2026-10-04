import type { ToolErrorCode, ToolErrorDetails } from '@mochifile/tool-kit'

export interface FileError {
  code: ToolErrorCode | 'unknown'
  details: ToolErrorDetails | undefined
}

/** Translated copy stays with each tool; this maps the shared error codes to that copy. */
export interface ErrorMessages {
  unsupportedType: () => string
  fileTooLarge: () => string
  invalidFile: () => string
  dimensionsTooLarge: (maxMegapixels: number) => string
  targetUnreachable: (smallestBytes: number) => string
  generic: () => string
}

/** Maps a worker or validation error to a safe, translated user message. */
export function errorMessage(error: FileError | undefined, messages: ErrorMessages): string {
  switch (error?.code) {
    case 'unsupported-type':
      return messages.unsupportedType()
    case 'file-too-large':
      return messages.fileTooLarge()
    case 'invalid-file':
      return messages.invalidFile()
    case 'dimensions-too-large':
      return messages.dimensionsTooLarge(Number(error.details?.maxMegapixels ?? 100))
    case 'target-unreachable':
      return messages.targetUnreachable(Number(error.details?.smallestBytes ?? 0))
    default:
      return messages.generic()
  }
}
