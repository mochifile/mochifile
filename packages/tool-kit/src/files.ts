import type { ToolManifest } from './contract.ts'
import { ToolError } from './errors.ts'

/** Returns true if `type` matches one of the accepted MIME patterns (`image/*` allowed). */
export function matchesMime(type: string, accepts: readonly string[]): boolean {
  const normalized = type.toLowerCase()
  return accepts.some((pattern) => {
    const p = pattern.toLowerCase()
    if (p.endsWith('/*')) return normalized.startsWith(p.slice(0, -1))
    return normalized === p
  })
}

type FileLike = Pick<File, 'size' | 'type'> & { name?: string }

/**
 * MIME types by extension, for files that arrive without a type. HEIC photos often do: Windows
 * and some Android browsers report an empty type or `application/octet-stream` (ADR 0022). The
 * worker still checks the file's bytes; this only decides whether to accept it for checking.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
}

/** The file's MIME type, or one inferred from its extension when the browser gives none. */
export function fileMimeType(file: FileLike): string {
  const type = file.type.toLowerCase()
  if (type && type !== 'application/octet-stream') return type
  const ext = splitFileName(file.name ?? '').ext.toLowerCase()
  return MIME_BY_EXTENSION[ext] ?? type
}

/** Validates files against a manifest's `accepts` and `limits`. Throws `ToolError`. */
export function validateFiles(
  files: readonly FileLike[],
  manifest: Pick<ToolManifest, 'accepts' | 'limits'>,
): void {
  const { limits, accepts } = manifest
  if (files.length === 0) throw new ToolError('no-files')
  if (files.length > limits.maxFiles) {
    throw new ToolError('too-many-files', `Received ${files.length}, max ${limits.maxFiles}`)
  }
  let total = 0
  for (const file of files) {
    if (!matchesMime(fileMimeType(file), accepts)) {
      throw new ToolError('unsupported-type', `Unsupported type "${file.type}"`)
    }
    if (file.size > limits.maxFileSizeBytes) {
      throw new ToolError('file-too-large', `File of ${file.size} bytes exceeds limit`)
    }
    total += file.size
  }
  if (limits.maxTotalSizeBytes !== undefined && total > limits.maxTotalSizeBytes) {
    throw new ToolError('total-too-large', `Total of ${total} bytes exceeds limit`)
  }
}

const byteUnits = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const

/** Formats a byte count for humans, e.g. `1.5 MB`, using decimal (SI) units. */
export function formatBytes(bytes: number, locale = 'en'): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1000 && unit < byteUnits.length - 1) {
    value /= 1000
    unit += 1
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: byteUnits[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value)
}

/** Splits `photo.final.jpg` into `{ base: 'photo.final', ext: 'jpg' }`. */
export function splitFileName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot + 1) }
}

/**
 * Builds an output file name: `renameFile('IMG_1.heic', { suffix: 'converted', ext: 'jpg' })`
 * gives `IMG_1-converted.jpg`.
 */
export function renameFile(
  name: string,
  { suffix, ext }: { suffix?: string; ext?: string },
): string {
  const parts = splitFileName(name)
  const base = suffix ? `${parts.base}-${suffix}` : parts.base
  const extension = ext ?? parts.ext
  return extension ? `${base}.${extension}` : base
}
