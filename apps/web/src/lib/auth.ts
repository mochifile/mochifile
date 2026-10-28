import { type Locale, localePath, locales } from '@mochifile/i18n'

/** The two account pages. Accounts are not available yet; the pages say so. */
export const authModes = ['sign-in', 'sign-up'] as const
export type AuthMode = (typeof authModes)[number]

/** Translated like the tool slugs: lowercase kebab-case, the Portuguese one in Portuguese. */
export const authSlugs: Record<AuthMode, Record<Locale, string>> = {
  'sign-in': { en: 'sign-in', pt: 'entrar' },
  'sign-up': { en: 'sign-up', pt: 'criar-conta' },
}

/** Path of a page in every locale, for `hreflang` and the links between the two pages. */
export function authPaths(mode: AuthMode): Record<Locale, string> {
  return Object.fromEntries(
    locales.map((locale) => [locale, localePath(locale, authSlugs[mode][locale])]),
  ) as Record<Locale, string>
}

/**
 * The screens of the sign-in flow after the form, shown only as a preview (no email is sent, no
 * code is checked). Each is a `:target` of the page; `id` is what the link points to.
 */
export const authPreviewSteps = ['code', 'checking', 'wrong', 'expired'] as const
export type AuthPreviewStep = (typeof authPreviewSteps)[number]
export const authStepId = (step: AuthPreviewStep | 'email') => `step-${step}`
