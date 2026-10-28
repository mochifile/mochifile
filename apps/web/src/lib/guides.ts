import { type Locale, localePath, locales } from '@mochifile/i18n'
import { z } from 'astro/zod'

/** The topics a guide can have, in the order of the filter chips. */
export const guideTopics = [
  'quick',
  'forms',
  'formats',
  'performance',
  'privacy',
  'pdf',
  'video',
  'workflows',
] as const
export type GuideTopic = (typeof guideTopics)[number]

/** Words per minute used for the reading time. Nothing about a guide's length is typed by hand. */
const WORDS_PER_MINUTE = 200

/**
 * Frontmatter of a guide (`content/guides/<key>/<locale>.md`). The slug is translated like a
 * tool's. There is no date and no author field on purpose: a guide shows neither until there is
 * a real one to show.
 */
export const guideSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(110),
    summary: z.string().trim().min(1).max(200),
    topic: z.enum(guideTopics),
    /** Not written yet: listed as a draft, with no page. */
    draft: z.boolean().default(false),
    /** `hero` is the big card at the top; `pick` the two cards under it. */
    spotlight: z.enum(['hero', 'pick']).optional(),
    /** Key of a size variant of Compress image (for example `50kb`) the guide's last card opens. */
    ctaVariant: z.string().optional(),
  })
  .strict()

export type GuideMeta = z.infer<typeof guideSchema>

/** Every guide, in the order the list shows them. A file for a key not listed here is an error. */
export const guideOrder = [
  'compress-photo-50kb',
  'what-is-webp',
  'heic-vs-jpg',
  'passport-photo-upload',
  'remove-location-data',
  'product-photo-formats',
  'batch-crop-square',
  'compression-quality',
  'pdf-for-portals',
  'iphone-mov-to-mp4',
  'processed-in-your-browser',
  'picture-element-fallback',
] as const

/** First path segment of the guides, per locale. */
export const guidesSection: Record<Locale, string> = { en: 'guides', pt: 'guias' }

export interface Guide {
  key: string
  topic: GuideTopic
  draft: boolean
  spotlight: 'hero' | 'pick' | undefined
  ctaVariant: string | undefined
  meta: Record<Locale, { slug: string; title: string; summary: string; minutes: number }>
}

export interface GuideSource {
  /** `<key>/<locale>`, the entry's id in the collection. */
  id: string
  data: GuideMeta
  body?: string | undefined
}

/** Whole minutes to read a text, at least one. */
export function readingMinutes(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}

/**
 * The guides in `guideOrder`, with both locales of each. Throws when a guide misses a locale,
 * when the locales disagree on what is language-independent, or when a file belongs to no key.
 */
export function buildGuides(sources: readonly GuideSource[]): Guide[] {
  const byId = new Map(sources.map((source) => [source.id, source]))
  const unknown = sources.filter(
    ({ id }) => !(guideOrder as readonly string[]).includes(id.split('/')[0] ?? ''),
  )
  if (unknown.length > 0)
    throw new Error(
      `Guide files for keys not in guideOrder: ${unknown.map(({ id }) => id).join(', ')}`,
    )

  return guideOrder.map((key) => {
    const [first, ...rest] = locales.map((locale) => {
      const source = byId.get(`${key}/${locale}`)
      if (!source) throw new Error(`Guide "${key}" has no ${locale} file`)
      return { locale, ...source }
    })
    if (!first) throw new Error('No locales')
    for (const other of rest) {
      for (const field of ['topic', 'draft', 'spotlight', 'ctaVariant'] as const) {
        if (other.data[field] !== first.data[field]) {
          throw new Error(
            `Guide "${key}": "${field}" differs between ${first.locale} and ${other.locale}`,
          )
        }
      }
    }
    const meta = Object.fromEntries(
      [first, ...rest].map(({ locale, data, body }) => [
        locale,
        {
          slug: data.slug,
          title: data.title,
          summary: data.summary,
          minutes: readingMinutes(body ?? ''),
        },
      ]),
    ) as Guide['meta']
    return {
      key,
      topic: first.data.topic,
      draft: first.data.draft,
      spotlight: first.data.spotlight,
      ctaVariant: first.data.ctaVariant,
      meta,
    }
  })
}

/** Where the list of guides lives, in every locale. */
export function guidesIndexPaths(): Record<Locale, string> {
  return Object.fromEntries(
    locales.map((locale) => [locale, localePath(locale, guidesSection[locale])]),
  ) as Record<Locale, string>
}

/** Path of a guide's page in every locale. */
export function guidePaths(guide: Guide): Record<Locale, string> {
  return Object.fromEntries(
    locales.map((locale) => [
      locale,
      localePath(locale, `${guidesSection[locale]}/${guide.meta[locale].slug}`),
    ]),
  ) as Record<Locale, string>
}

/** Guides that have a page. Drafts only appear in the list. */
export function publishedGuides(guides: readonly Guide[]): Guide[] {
  return guides.filter((guide) => !guide.draft)
}
