/**
 * Locale configuration shared by the whole monorepo.
 *
 * Keep this list in sync with `project.inlang/settings.json` (a unit test enforces it).
 * The default locale is served at the site root without a prefix; every other locale
 * lives under `/<locale>/`.
 */
export const locales = ['en', 'pt'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

/** Human-readable names, written in their own language, for language switchers. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  pt: 'Português',
}

/** BCP 47 tags used for `<html lang>` and `hreflang`. */
export const localeTags: Record<Locale, string> = {
  en: 'en',
  pt: 'pt',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}

/**
 * Builds a site-relative path for a locale. The default locale has no prefix, and paths
 * always end with a slash (pages are built as `<path>/index.html`).
 *
 * @example localePath('pt', 'compress-image') // => '/pt/compress-image/'
 * @example localePath('en') // => '/'
 */
export function localePath(locale: Locale, path = '/'): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '')
  const prefix = locale === defaultLocale ? '' : `/${locale}`
  return trimmed ? `${prefix}/${trimmed}/` : `${prefix}/`
}
