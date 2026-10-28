import { type Locale, localePath } from '@mochifile/i18n'

/** Slug of the page that lists every tool (Solutions), per locale. */
const solutionsSlug: Record<Locale, string> = { en: 'solutions', pt: 'solucoes' }

export interface SeeAllToolsInput {
  locale: Locale
  /** Whether this build has a Solutions page. */
  hasSolutions: boolean
  /** Path of the first published tool, in this locale, if there is one. */
  firstToolPath: string | undefined
}

/**
 * Where "See all tools" goes. The Solutions page when the site has it; until then the first
 * published tool, and the home page when there is none. A 404 page must never link to a
 * page that does not exist.
 */
export function seeAllToolsHref({ locale, hasSolutions, firstToolPath }: SeeAllToolsInput): string {
  if (hasSolutions) return localePath(locale, solutionsSlug[locale])
  return firstToolPath ?? localePath(locale)
}
