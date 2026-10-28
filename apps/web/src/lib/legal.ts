import { type Locale, localePath, locales } from '@mochifile/i18n'

/**
 * The four legal pages. Their layout is the artboards'; their text is not written: it has to
 * come from a lawyer, so every clause is a grey line and the page says it is a draft. Nothing
 * here may be read as a policy or a contract in force.
 */
export const legalPageIds = ['privacy', 'terms-of-service', 'terms-and-conditions', 'dpa'] as const
export type LegalPageId = (typeof legalPageIds)[number]

/** Translated like the tool slugs: lowercase kebab-case, the Portuguese ones in Portuguese. */
export const legalSlugs: Record<LegalPageId, Record<Locale, string>> = {
  privacy: { en: 'privacy-policy', pt: 'politica-de-privacidade' },
  'terms-of-service': { en: 'terms-of-service', pt: 'termos-de-servico' },
  'terms-and-conditions': { en: 'terms-and-conditions', pt: 'termos-e-condicoes' },
  dpa: { en: 'data-processing-agreement', pt: 'acordo-de-processamento-de-dados' },
}

/** Path of a page in every locale, for `hreflang`, the language link and the footer. */
export function legalPaths(id: LegalPageId): Record<Locale, string> {
  return Object.fromEntries(
    locales.map((locale) => [locale, localePath(locale, legalSlugs[id][locale])]),
  ) as Record<Locale, string>
}

/**
 * A section of clauses: `lines` has one number per clause, the lines of grey that stand for its
 * text, as drawn in the artboard. The heading is the message `legal_<page>_<id>`.
 */
export interface LegalSection {
  id: string
  lines: readonly number[]
  /** Numbered on its own (the parties of the DPA), not counted in the clauses that follow. */
  separate?: boolean
}

export const legalSections: Record<LegalPageId, readonly LegalSection[]> = {
  privacy: [
    { id: 'who', lines: [2] },
    { id: 'never', lines: [2] },
    { id: 'website', lines: [2, 2] },
    { id: 'accounts', lines: [3, 2] },
    { id: 'cookies', lines: [2] },
    { id: 'retention', lines: [2] },
    { id: 'rights', lines: [3, 2] },
    { id: 'children', lines: [1] },
    { id: 'changes', lines: [1] },
    { id: 'contact', lines: [2] },
  ],
  'terms-of-service': [
    { id: 'grant', lines: [2, 3, 2] },
    { id: 'term', lines: [2, 2] },
    { id: 'fees', lines: [3, 2, 2] },
    { id: 'restrictions', lines: [2, 2, 2, 2] },
    { id: 'warranties', lines: [3, 2] },
    { id: 'indemnity', lines: [2, 2] },
    { id: 'liability', lines: [3, 2, 3] },
    { id: 'ip', lines: [2, 2] },
    { id: 'data', lines: [3, 2] },
    { id: 'changes', lines: [2] },
    { id: 'general', lines: [2, 2, 2] },
    { id: 'law', lines: [2] },
  ],
  'terms-and-conditions': [
    { id: 'ip', lines: [3, 2, 2, 3] },
    { id: 'prohibited', lines: [3] },
    { id: 'links', lines: [2, 2] },
    { id: 'privacy', lines: [2] },
    { id: 'availability', lines: [3, 2, 2] },
    { id: 'liability', lines: [2, 3] },
    { id: 'general', lines: [2, 2, 2] },
  ],
  dpa: [
    { id: 'parties', lines: [2, 3], separate: true },
    { id: 'background', lines: [2, 2] },
    { id: 'definitions', lines: [3, 2] },
    { id: 'processing', lines: [2, 3, 2] },
    { id: 'security', lines: [3, 2] },
    { id: 'subprocessors', lines: [2, 2, 2] },
    { id: 'rights', lines: [2, 2] },
    { id: 'breaches', lines: [3] },
    { id: 'return', lines: [2, 2] },
    { id: 'audits', lines: [2, 2] },
    { id: 'liability', lines: [2] },
    { id: 'general', lines: [2, 2] },
    { id: 'law', lines: [2] },
  ],
}

/** The terms of the Terms of Service's definitions table, with the lines of each definition. */
export const definitionTerms = [
  { id: 'account', lines: 2 },
  { id: 'content', lines: 2 },
  { id: 'customer', lines: 2 },
  { id: 'documentation', lines: 2 },
  { id: 'fees', lines: 2 },
  { id: 'plan', lines: 2 },
  { id: 'services', lines: 2 },
  { id: 'subscription_term', lines: 2 },
  { id: 'user', lines: 2 },
] as const

export interface NumberedSection {
  id: string
  /** Number of the section's first clause. */
  start: number
  lines: readonly number[]
}

/** Gives each section the number of its first clause; the numbers run on through the page. */
export function numberSections(sections: readonly LegalSection[]): NumberedSection[] {
  let next = 1
  return sections.map((section) => {
    if (section.separate) return { id: section.id, start: 1, lines: section.lines }
    const start = next
    next += section.lines.length
    return { id: section.id, start, lines: section.lines }
  })
}

/** Widths of the grey lines, in turn: uneven, like text, and the same on every build. */
const widths = [
  'w-full',
  'w-11/12',
  'w-3/4',
  'w-full',
  'w-5/6',
  'w-2/3',
  'w-11/12',
  'w-4/5',
] as const

/** The classes for the width of the n-th grey line of the page. */
export function lineWidth(index: number): string {
  return widths[index % widths.length] ?? 'w-full'
}
