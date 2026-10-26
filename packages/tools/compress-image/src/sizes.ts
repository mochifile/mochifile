/**
 * Size targets: presets, display and parsing. 1 KB = 1,000 bytes and 1 MB = 1,000,000 bytes
 * (ADR 0017), so a "50 KB" result also passes portals that count 1 KB as 1,024 bytes.
 */

export const PRESETS = [
  { key: '20kb', bytes: 20_000 },
  { key: '50kb', bytes: 50_000 },
  { key: '100kb', bytes: 100_000 },
  { key: '200kb', bytes: 200_000 },
  { key: '500kb', bytes: 500_000 },
  { key: '1mb', bytes: 1_000_000 },
] as const

/** Smallest and largest custom target. Below 5 KB almost no photo is recognisable. */
export const MIN_TARGET = 5_000
export const MAX_TARGET = 20_000_000

export type SizeUnit = 'kb' | 'mb'

const UNIT_BYTES: Record<SizeUnit, number> = { kb: 1_000, mb: 1_000_000 }

export { formatSize } from '@mochifile/tool-ui'

/** Suffix for output file names: `50kb`, `1mb`, `1.5mb`. */
export function sizeSuffix(bytes: number): string {
  const [unit, divisor]: [SizeUnit, number] = bytes >= 1_000_000 ? ['mb', 1_000_000] : ['kb', 1_000]
  const value = Math.round((bytes / divisor) * 100) / 100
  return `${value}${unit}`
}

export type ParsedTarget =
  | { ok: true; bytes: number }
  | { ok: false; reason: 'invalid' | 'out-of-range' }

/** Parses what someone typed ("75", "1,5", "1.5") in a unit, within the allowed range. */
export function parseTarget(text: string, unit: SizeUnit): ParsedTarget {
  const normalized = text.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false, reason: 'invalid' }
  const bytes = Math.round(Number.parseFloat(normalized) * UNIT_BYTES[unit])
  if (bytes < MIN_TARGET || bytes > MAX_TARGET) return { ok: false, reason: 'out-of-range' }
  return { ok: true, bytes }
}
