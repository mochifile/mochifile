// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { locales } from '@mochifile/i18n'
import { describe, expect, it } from 'vitest'
import { pageContentId, pageIds, pagePaths, pageSlugs } from './pages.ts'
import { tools } from './tools.ts'

const src = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

describe('institutional pages', () => {
  it('builds paths that end with a slash, translated and under the locale prefix', () => {
    expect(pagePaths('about')).toEqual({ en: '/about/', pt: '/pt/sobre/' })
    expect(pagePaths('contact')).toEqual({ en: '/contact/', pt: '/pt/contato/' })
    expect(pagePaths('sustainability')).toEqual({
      en: '/sustainability/',
      pt: '/pt/sustentabilidade/',
    })
    expect(pagePaths('architecture')).toEqual({ en: '/architecture/', pt: '/pt/arquitetura/' })
  })

  it('has lowercase kebab-case slugs, unique within each locale', () => {
    for (const locale of locales) {
      const slugs = pageIds.map((id) => pageSlugs[id][locale])
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
    for (const id of pageIds) {
      for (const locale of locales) expect(toolSlugs).not.toContain(pageSlugs[id][locale])
    }
  })

  it('has a route file and Markdown copy for every page in every locale', () => {
    for (const id of pageIds) {
      for (const locale of locales) {
        const route = `pages/${locale === 'en' ? '' : `${locale}/`}${pageSlugs[id][locale]}.astro`
        expect(existsSync(src(route)), route).toBe(true)
        const [dir, file] = pageContentId(id, locale).split('/')
        expect(existsSync(src(`content/pages/${dir}/${file}.md`)), pageContentId(id, locale)).toBe(
          true,
        )
      }
    }
  })

  it('has no Markdown copy for a page that is not registered', () => {
    for (const locale of locales) {
      const files = readdirSync(src(`content/pages/${locale}`)).map((name) =>
        name.replace('.md', ''),
      )
      expect(files.sort()).toEqual([...pageIds].sort())
    }
  })

  it('leaves no placeholder in the copy', () => {
    for (const locale of locales) {
      for (const id of pageIds) {
        const text = readFileSync(src(`content/pages/${locale}/${id}.md`), 'utf8')
        expect(text, `${locale}/${id}`).not.toMatch(/to be provided|TBD|lorem/i)
      }
    }
  })
})
