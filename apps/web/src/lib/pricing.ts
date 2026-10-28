import { type Locale, localePath } from '@mochifile/i18n'

/**
 * The paid plans of the V2 pricing page. Every figure is a proposal (docs/design-ref/v2 README ›
 * "Current design decisions"): nothing here can be bought, and the page says so. Amounts are
 * whole cents so that the yearly price per month and the saving are exact, never rounded floats.
 */
export type PlanId = 'starter' | 'pro' | 'max'

export interface Plan {
  id: PlanId
  /** The plan's name; a product name, never translated. */
  name: string
  monthlyCents: number
  yearlyCents: number
  /** The plan drawn with the purple border and the "Most popular" pill. */
  popular: boolean
}

export const plans: readonly [Plan, Plan, Plan] = [
  { id: 'starter', name: 'Mochi Starter', monthlyCents: 199, yearlyCents: 1788, popular: false },
  { id: 'pro', name: 'Mochi Pro', monthlyCents: 299, yearlyCents: 2388, popular: true },
  { id: 'max', name: 'Mochi Max', monthlyCents: 599, yearlyCents: 5388, popular: false },
]

/** What one month costs when billed yearly, in cents. */
export function yearlyPerMonthCents(plan: Plan): number {
  return plan.yearlyCents / 12
}

/** How much cheaper the yearly price is than twelve monthly ones, as a whole percentage. */
export function savePercent(plan: Plan): number {
  return Math.round((1 - plan.yearlyCents / (plan.monthlyCents * 12)) * 100)
}

/**
 * `199` as "$1.99" in English and "US$ 1,99" in Portuguese (prices are in US dollars); a whole
 * amount has no cents, as the canvas draws "$0".
 */
export function formatUsd(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

/** The page's path in every locale. */
export const pricingPaths: Record<Locale, string> = {
  en: localePath('en', 'pricing'),
  pt: localePath('pt', 'precos'),
}
