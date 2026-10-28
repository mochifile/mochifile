// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { locales } from '@mochifile/i18n'
import { describe, expect, it } from 'vitest'
import {
  definitionTerms,
  legalPageIds,
  legalPaths,
  legalSections,
  legalSlugs,
  lineWidth,
  numberSections,
} from './legal.ts'
import { tools } from './tools.ts'

const src = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const messages = (locale: string) =>
  JSON.parse(
    readFileSync(src(`../../../packages/i18n/messages/legal/${locale}.json`), 'utf8'),
  ) as Record<string, string>

describe('legal pages', () => {
  it('builds translated paths that end with a slash', () => {
    expect(legalPaths('privacy')).toEqual({
      en: '/privacy-policy/',
      pt: '/pt/politica-de-privacidade/',
    })
    expect(legalPaths('dpa').en).toBe('/data-processing-agreement/')
  })

  it('has lowercase kebab-case slugs, unique within each locale', () => {
    for (const locale of locales) {
      const slugs = legalPageIds.map((id) => legalSlugs[id][locale])
      expect(new Set(slugs).size).toBe(slugs.length)
      for (const slug of slugs) expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/)
    }
  })

  it('never shares a slug with a tool page, which a route file would shadow', () => {
    const toolSlugs = tools.flatMap(({ manifest }) =>
      locales.flatMap((locale) => [
        manifest.meta[locale].slug,
        ...(manifest.variants ?? []).map((variant) => variant.meta[locale].slug),
      ]),
    )
    for (const id of legalPageIds) {
      for (const locale of locales) expect(toolSlugs).not.toContain(legalSlugs[id][locale])
    }
  })

  it('has a route file for every page in every locale', () => {
    for (const id of legalPageIds) {
      for (const locale of locales) {
        const route = `pages/${locale === 'en' ? '' : `${locale}/`}${legalSlugs[id][locale]}.astro`
        expect(existsSync(src(route)), route).toBe(true)
      }
    }
  })

  it('numbers the clauses as the artboards do', () => {
    const starts = (id: (typeof legalPageIds)[number]) =>
      numberSections(legalSections[id]).map((section) => section.start)
    expect(starts('privacy')).toEqual([1, 2, 3, 5, 7, 8, 9, 11, 12, 13])
    expect(starts('terms-of-service')).toEqual([1, 4, 6, 9, 13, 15, 17, 20, 22, 24, 25, 28])
    expect(starts('terms-and-conditions')).toEqual([1, 5, 6, 8, 9, 12, 14])
    // The DPA's parties are numbered on their own.
    expect(starts('dpa')).toEqual([1, 1, 3, 5, 8, 10, 13, 15, 16, 18, 20, 21, 23])
  })

  it('has a heading in every locale for every section, definition and page', () => {
    for (const locale of locales) {
      const texts = messages(locale)
      for (const id of legalPageIds) {
        const prefix = `legal_${id.replaceAll('-', '_')}`
        for (const key of ['title', 'description', 'heading']) {
          expect(texts[`${prefix}_${key}`], `${locale} ${prefix}_${key}`).toBeTruthy()
        }
        for (const section of legalSections[id]) {
          expect(texts[`${prefix}_${section.id}`], `${locale} ${prefix}_${section.id}`).toBeTruthy()
        }
      }
      for (const term of definitionTerms) expect(texts[`legal_def_${term.id}`]).toBeTruthy()
    }
  })

  it('varies the width of the grey lines and repeats the same on every build', () => {
    const widths = Array.from({ length: 16 }, (_, index) => lineWidth(index))
    expect(new Set(widths).size).toBeGreaterThan(3)
    expect(widths.slice(0, 8)).toEqual(widths.slice(8))
  })

  it('writes no clause: the pages hold headings, grey lines and what is documented', () => {
    const page = readFileSync(src('components/LegalPage.astro'), 'utf8')
    expect(page).not.toMatch(/<script/)
    // Clause lists stay out of the accessibility tree: they hold only grey lines.
    expect(page).toContain('aria-hidden="true" class="legal-clauses"')
    for (const locale of locales) {
      const texts = messages(locale)
      // No date, no "effective" or "in force" claim.
      for (const [key, value] of Object.entries(texts)) {
        if (key === '$schema') continue
        expect(value, key).not.toMatch(/\b(19|20)\d\d\b/)
      }
    }
  })
})
