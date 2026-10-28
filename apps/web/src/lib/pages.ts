import { type Locale, localePath, locales } from '@mochifile/i18n'

/**
 * The institutional pages: About, Contact, Sustainability and Architecture & data handling.
 * Not tools, so they are not in the registry; each has a route file in `src/pages` (and one
 * under `pt/`) because their slugs are fixed. Their copy is `content/pages/<locale>/<id>.md`.
 */
export const pageIds = ['about', 'contact', 'sustainability', 'architecture'] as const
export type PageId = (typeof pageIds)[number]

/** Translated like the tool slugs: lowercase kebab-case, the Portuguese one in Portuguese. */
export const pageSlugs: Record<PageId, Record<Locale, string>> = {
  about: { en: 'about', pt: 'sobre' },
  contact: { en: 'contact', pt: 'contato' },
  sustainability: { en: 'sustainability', pt: 'sustentabilidade' },
  architecture: { en: 'architecture', pt: 'arquitetura' },
}

/** Path of a page in every locale, for `hreflang`, the language link and the footer. */
export function pagePaths(id: PageId): Record<Locale, string> {
  return Object.fromEntries(
    locales.map((locale) => [locale, localePath(locale, pageSlugs[id][locale])]),
  ) as Record<Locale, string>
}

/** The id of a page's copy in the `pageContent` collection. */
export function pageContentId(id: PageId, locale: Locale): string {
  return `${locale}/${id}`
}
