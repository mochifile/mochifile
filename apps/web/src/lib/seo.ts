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

export interface BreadcrumbItem {
  name: string
  /** Absolute URL. */
  url: string
}

export interface ToolJsonLdInput {
  /** Page title, without the site name. */
  name: string
  description: string
  /** Absolute canonical URL of the page. */
  url: string
  locale: Locale
  category: 'image' | 'media' | 'pdf'
  /** From the home page down to this page. */
  breadcrumbs: readonly BreadcrumbItem[]
}

const applicationCategories = {
  image: 'MultimediaApplication',
  media: 'MultimediaApplication',
  pdf: 'UtilitiesApplication',
} as const

/**
 * Structured data for a tool page: a free `WebApplication` that runs in the browser, and its
 * `BreadcrumbList`. See https://schema.org/WebApplication.
 */
export function toolJsonLd(input: ToolJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: input.name,
        description: input.description,
        url: input.url,
        inLanguage: localeTags[input.locale],
        applicationCategory: applicationCategories[input.category],
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript and a modern web browser.',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: input.breadcrumbs.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: item.url,
        })),
      },
    ],
  }
}

/**
 * Serializes JSON-LD for a `<script type="application/ld+json">` element. `<`, `>` and `&`
 * are escaped so text such as `</script>` in a title can never close the element early.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
}
