// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { locales } from '@mochifile/i18n'
import { describe, expect, it } from 'vitest'
import {
  buildGuides,
  type GuideMeta,
  type GuideSource,
  guideOrder,
  guidePaths,
  guideSchema,
  guidesIndexPaths,
  guidesSection,
  guideTopics,
  publishedGuides,
  readingMinutes,
} from './guides.ts'
import { tools } from './tools.ts'

const src = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

const meta = (patch: Partial<GuideMeta> = {}): GuideMeta => ({
  slug: 'a-guide',
  title: 'A guide',
  summary: 'What it is about.',
  topic: 'privacy',
  draft: false,
  ...patch,
})

/** Every key in `guideOrder`, in every locale, with one field changed where asked. */
function sources(patch: (id: string) => Partial<GuideMeta> = () => ({})): GuideSource[] {
  return guideOrder.flatMap((key) =>
    locales.map((locale) => {
      const id = `${key}/${locale}`
      return { id, data: meta({ slug: `${key}-${locale}`, ...patch(id) }), body: 'one two three' }
    }),
  )
}

describe('readingMinutes', () => {
  it('counts 200 words a minute and never says less than one', () => {
    expect(readingMinutes('')).toBe(1)
    expect(readingMinutes('word '.repeat(200))).toBe(1)
    expect(readingMinutes('word '.repeat(201))).toBe(2)
    expect(readingMinutes('word\n\n  word\tword')).toBe(1)
  })
})

describe('buildGuides', () => {
  it('returns the guides in the order of guideOrder, with both locales', () => {
    const guides = buildGuides(sources().reverse())
    expect(guides.map((guide) => guide.key)).toEqual([...guideOrder])
    expect(guides[0]?.meta.pt.slug).toBe(`${guideOrder[0]}-pt`)
    expect(guides[0]?.meta.en.minutes).toBe(1)
  })

  it('fails when a locale is missing', () => {
    expect(() => buildGuides(sources().filter(({ id }) => id !== `${guideOrder[0]}/pt`))).toThrow(
      /no pt file/,
    )
  })

  it('fails when the locales disagree on the topic', () => {
    const id = `${guideOrder[1]}/pt`
    expect(() => buildGuides(sources((who) => (who === id ? { topic: 'pdf' } : {})))).toThrow(
      /"topic" differs/,
    )
  })

  it('fails on a file for a key that is not listed', () => {
    expect(() => buildGuides([...sources(), { id: 'stray/en', data: meta() }])).toThrow(
      /not in guideOrder/,
    )
  })

  it('builds paths under the translated section', () => {
    const [guide] = buildGuides(sources())
    expect(guide && guidePaths(guide)).toEqual({
      en: `/guides/${guideOrder[0]}-en/`,
      pt: `/pt/guias/${guideOrder[0]}-pt/`,
    })
    expect(guidesIndexPaths()).toEqual({ en: '/guides/', pt: '/pt/guias/' })
  })

  it('leaves drafts out of the published guides', () => {
    const guides = buildGuides(
      sources((id) => (id.startsWith(`${guideOrder[2]}/`) ? { draft: true } : {})),
    )
    expect(publishedGuides(guides)).toHaveLength(guideOrder.length - 1)
  })
})

describe('guideSchema', () => {
  it('has no date or author field', () => {
    expect(guideSchema.safeParse({ ...meta(), date: '2026-01-01' }).success).toBe(false)
    expect(guideSchema.safeParse({ ...meta(), author: 'Someone' }).success).toBe(false)
  })
})

describe('the guides in the repository', () => {
  const files = guideOrder.flatMap((key) => locales.map((locale) => ({ key, locale })))

  it('has a file for every guide in every locale, and no other', () => {
    for (const { key, locale } of files) {
      expect(existsSync(src(`content/guides/${key}/${locale}.md`)), `${key}/${locale}`).toBe(true)
    }
    expect(readdirSync(src('content/guides')).sort()).toEqual([...guideOrder].sort())
  })

  it('has valid frontmatter, translated slugs and a body for every published guide', () => {
    for (const { key, locale } of files) {
      const text = readFileSync(src(`content/guides/${key}/${locale}.md`), 'utf8')
      const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
      expect(match, `${key}/${locale}`).not.toBeNull()
      const [, front = '', body = ''] = match ?? []
      const data = Object.fromEntries(
        front.split('\n').map((line) => {
          const [name = '', ...rest] = line.split(': ')
          return [name, rest.join(': ').replace(/^"(.*)"$/, '$1')]
        }),
      )
      expect(Object.keys(data).filter((name) => /date|author|by/i.test(name))).toEqual([])
      const draft = data.draft === 'true'
      expect(body.trim().length > 0, `${key}/${locale} body`).toBe(!draft)
      expect(guideTopics as readonly string[]).toContain(data.topic)
    }
  })

  it('never shares a slug with a tool, the route of a section or another guide', () => {
    const toolSlugs = tools.flatMap(({ manifest }) =>
      locales.flatMap((locale) => [
        manifest.meta[locale].slug,
        ...(manifest.variants ?? []).map((variant) => variant.meta[locale].slug),
      ]),
    )
    for (const locale of locales) {
      expect(toolSlugs).not.toContain(guidesSection[locale])
      const slugs = files
        .filter((file) => file.locale === locale)
        .map(
          ({ key }) =>
            /^slug: (.+)$/m.exec(
              readFileSync(src(`content/guides/${key}/${locale}.md`), 'utf8'),
            )?.[1],
        )
      expect(new Set(slugs).size).toBe(slugs.length)
    }
  })

  it('has a chip rule in the list page for every topic', () => {
    const page = readFileSync(src('components/GuidesPage.astro'), 'utf8')
    for (const topic of guideTopics) expect(page).toContain(`input[value="${topic}"]:checked`)
  })

  it('has a route for the list and the articles in each locale', () => {
    for (const path of [
      'pages/guides/index.astro',
      'pages/guides/[slug].astro',
      'pages/pt/guias/index.astro',
      'pages/pt/guias/[slug].astro',
    ]) {
      expect(existsSync(src(path)), path).toBe(true)
    }
  })
})
