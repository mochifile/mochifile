import { defaultLocale, type Locale, localePath, locales, localeTags } from '@mochifile/i18n'

export interface AlternateLink {
  hreflang: string
  href: string
}

/**
 * Builds the `<link rel="alternate">` set for a page that exists in every locale:
 * one entry per locale plus `x-default`, which points to the default locale.
 *
 * @param paths the site-relative path of the page in each locale
 */
export function buildAlternates(
  paths: Record<Locale, string>,
  site: URL | string,
): AlternateLink[] {
  const absolute = (path: string) => new URL(path, site).href
  return [
    ...locales.map((locale) => ({ hreflang: localeTags[locale], href: absolute(paths[locale]) })),
    { hreflang: 'x-default', href: absolute(paths[defaultLocale]) },
  ]
}

/** Paths of a page whose slug is the same in every locale (e.g. the home page). */
export function samePathInAllLocales(path = '/'): Record<Locale, string> {
  return Object.fromEntries(locales.map((locale) => [locale, localePath(locale, path)])) as Record<
    Locale,
    string
  >
}
