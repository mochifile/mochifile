/**
 * Formats a size the way people see it on forms: "48.7 KB", "1.2 MB" (with the locale's
 * decimal separator). Uses "KB" rather than Intl's "kB" because that is what forms say.
 */
export function formatSize(bytes: number, locale: string): string {
  const mega = bytes >= 1_000_000
  const value = bytes / (mega ? 1_000_000 : 1_000)
  const digits = value < 10 ? 1 : 0
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
    Math.floor(value * 10 ** digits) / 10 ** digits,
  )
  return `${number} ${mega ? 'MB' : 'KB'}`
}
