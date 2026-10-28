import type { Locale } from '@mochifile/i18n'
import { m } from '@mochifile/i18n/messages'
import { MAIN_PAGE_KEY } from '@mochifile/tool-kit'
import { type RegisteredTool, toolPages } from './tools.ts'

/**
 * The Solutions catalogue (docs/design-ref/v2, artboard MFSolutions): every tool the design
 * draws, whether it exists yet or not. Only the entries with a `live` page lead anywhere; the
 * others render as the same card and say they are not available yet when used. Texts are the
 * `sol_*` messages, named after the tool id (`sol_t_<id>_title`, `_text`, `_pill`).
 */

export type Tint = 'mango' | 'ube' | 'matcha' | 'strawberry'

/** Stroked 24×24 icon paths from the canvas. */
export const ICONS = {
  compress: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01',
  camera: 'M4 7h4l2-3h4l2 3h4v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  sparkle: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z',
  scissors:
    'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8.5 7.5 20 18M8.5 16.5 20 6',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  hdr: 'M3 6h18v12H3zM7 10v4M7 12h3M10 10v4M13 10v4h2a2 2 0 0 0 0-4zM18 10v4',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
} as const
export type IconName = keyof typeof ICONS

export interface CatalogTool {
  id: string
  icon: IconName
  /** Colour of the icon tile. */
  tile: Tint
  /** Colour of the tag at the top right of the card. */
  pill: Tint
  /** The published page that does this, when there is one: a tool folder and a page key. */
  live?: { dir: string; key: string }
}

export interface CatalogCategory {
  id: string
  tools: CatalogTool[]
}

const compress = (id: string, pill: Tint, key?: string): CatalogTool => ({
  id,
  icon: 'compress',
  tile: 'mango',
  pill,
  ...(key ? { live: { dir: 'compress-image', key } } : {}),
})
const tool = (id: string, icon: IconName, tile: Tint, pill: Tint): CatalogTool => ({
  id,
  icon,
  tile,
  pill,
})

export const CATALOG: readonly CatalogCategory[] = [
  {
    id: 'compress',
    tools: [
      compress('compress-image', 'mango', MAIN_PAGE_KEY),
      compress('compress-50kb', 'mango', '50kb'),
      compress('compress-100kb', 'mango', '100kb'),
      compress('compress-200kb', 'ube', '200kb'),
    ],
  },
  {
    id: 'convert',
    tools: [
      tool('heic-jpg', 'image', 'ube', 'matcha'),
      tool('hif-jpg', 'camera', 'ube', 'matcha'),
      tool('heif-jpg', 'image', 'ube', 'matcha'),
      tool('avif-jpg', 'image', 'ube', 'ube'),
      tool('jxl-jpg', 'image', 'ube', 'ube'),
      tool('webp-jpg', 'image', 'ube', 'ube'),
      tool('webp-png', 'image', 'ube', 'ube'),
      tool('hif-avif', 'camera', 'ube', 'matcha'),
    ],
  },
  {
    id: 'web',
    tools: [
      tool('jpg-jxl', 'image', 'matcha', 'ube'),
      tool('avif-jxl', 'image', 'matcha', 'ube'),
      tool('svg-webp', 'sparkle', 'matcha', 'strawberry'),
      tool('svg-avif', 'sparkle', 'matcha', 'strawberry'),
      tool('svg-png', 'sparkle', 'matcha', 'strawberry'),
      tool('png-jxl', 'image', 'matcha', 'ube'),
    ],
  },
  {
    id: 'product',
    tools: [
      tool('bg-remover', 'scissors', 'strawberry', 'strawberry'),
      tool('bulk-square', 'crop', 'strawberry', 'mango'),
      tool('ebay-resizer', 'bag', 'strawberry', 'matcha'),
    ],
  },
  { id: 'hdr', tools: [tool('sdr-hdr', 'hdr', 'ube', 'ube')] },
  {
    id: 'pdf',
    tools: [
      tool('images-pdf', 'file', 'mango', 'strawberry'),
      tool('heic-pdf', 'file', 'mango', 'strawberry'),
      { ...tool('compress-pdf', 'compress', 'mango', 'strawberry') },
    ],
  },
  {
    id: 'video',
    tools: [
      tool('mp4-webm', 'film', 'matcha', 'matcha'),
      tool('webm-mp4', 'film', 'matcha', 'matcha'),
    ],
  },
]

type Message = (inputs: Record<string, never>, options: { locale: Locale }) => string

/** A `sol_*` message by key. Throws on a missing key, so a typo fails the build, not the page. */
export function solText(key: string, locale: Locale): string {
  const message = (m as unknown as Record<string, Message | undefined>)[`sol_${key}`]
  if (!message) throw new Error(`Missing message sol_${key}`)
  return message({}, { locale })
}

const underscore = (id: string) => id.replaceAll('-', '_')
export const toolTitle = (id: string, locale: Locale) =>
  solText(`t_${underscore(id)}_title`, locale)

/** Path of the published page behind a catalogue tool, or `undefined` while it does not exist. */
export function toolHref(
  registered: readonly RegisteredTool[],
  catalogTool: CatalogTool,
  locale: Locale,
): string | undefined {
  const live = catalogTool.live
  if (!live) return undefined
  return toolPages(registered).find((page) => page.tool.dir === live.dir && page.key === live.key)
    ?.paths[locale]
}

export type RichPart = { text: string } | { id: string; label: string }

/**
 * Splits a message with links, written `[[id|label]]`, into text and link parts. Paraglide has
 * no markup, and the sentences around each link differ by language, so each message carries its
 * own links; `id` says where each one goes.
 */
export function parseRich(source: string): RichPart[] {
  const parts: RichPart[] = []
  let last = 0
  for (const match of source.matchAll(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g)) {
    if (match.index > last) parts.push({ text: source.slice(last, match.index) })
    parts.push({ id: match[1] ?? '', label: match[2] ?? '' })
    last = match.index + match[0].length
  }
  if (last < source.length) parts.push({ text: source.slice(last) })
  return parts
}

/** Where a rich link goes: a catalogue tool's page when published, else nowhere yet. */
export function richHref(
  registered: readonly RegisteredTool[],
  id: string,
  locale: Locale,
): string | undefined {
  const found = CATALOG.flatMap((category) => category.tools).find((entry) => entry.id === id)
  return found ? toolHref(registered, found, locale) : undefined
}
