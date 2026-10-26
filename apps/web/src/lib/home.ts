import { type Locale, localePath } from '@mochifile/i18n'
import { type ToolCategory, toolCategories } from '@mochifile/tool-kit'
import { type RegisteredTool, toolPaths } from './tools.ts'

/**
 * The tool the home page's "Start here" card leads to. The card is a presentation choice: every
 * destination and value in it comes from this tool's manifest, and the card is left out when
 * the tool is not in the registry.
 */
export const START_TOOL_ID = 'compress-image'

/**
 * Target sizes, in bytes, the card shows first, in this order. Each one is shown only when a
 * variant of the start tool presets it; the tool's other size variants are listed after them.
 */
export const START_TARGETS: readonly number[] = [50_000, 100_000, 200_000]

export interface SizeLink {
  bytes: number
  /** As forms write it: "50 KB", "1 MB". */
  label: string
  href: string
  /** The variant page's title, e.g. "Compress an image to 50 KB", for the accessible name. */
  title: string
}

export interface StartCard {
  tool: RegisteredTool
  /** The tool's main page, which starts from the manifest's defaults. */
  href: string
  /** Sizes shown first, from `START_TARGETS`. */
  featured: SizeLink[]
  /** The tool's other size variants, smallest first. */
  others: SizeLink[]
}

/**
 * Formats a target the way forms write it: "50 KB", "1 MB", "1,5 MB" (1 KB = 1,000 bytes,
 * ADR 0017). Intl would write "kB".
 */
export function formatTarget(bytes: number, locale: Locale): string {
  const [divisor, unit] = bytes >= 1_000_000 ? [1_000_000, 'MB'] : [1_000, 'KB']
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / divisor)
  return `${number} ${unit}`
}

/** The "Start here" card, or `null` when the start tool is not published. */
export function startCard(registered: readonly RegisteredTool[], locale: Locale): StartCard | null {
  const tool = registered.find(({ manifest }) => manifest.id === START_TOOL_ID)
  if (!tool) return null
  const sizes = (tool.manifest.variants ?? []).flatMap((variant) => {
    const bytes = variant.options.targetBytes
    if (typeof bytes !== 'number') return []
    const meta = variant.meta[locale]
    return [
      {
        bytes,
        label: formatTarget(bytes, locale),
        href: localePath(locale, meta.slug),
        title: meta.title,
      },
    ]
  })
  const featured = START_TARGETS.flatMap((bytes) => sizes.filter((size) => size.bytes === bytes))
  const others = sizes
    .filter((size) => !START_TARGETS.includes(size.bytes))
    .sort((a, b) => a.bytes - b.bytes)
  return { tool, href: toolPaths(tool.manifest)[locale], featured, others }
}

export interface HomeToolGroup {
  category: ToolCategory
  tools: RegisteredTool[]
}

/**
 * Published tools grouped by category, for the home page's tool list. Only categories with a
 * tool appear, in the contract's order; tools keep the registry's order.
 */
export function homeToolGroups(registered: readonly RegisteredTool[]): HomeToolGroup[] {
  return toolCategories
    .map((category) => ({
      category,
      tools: registered.filter(({ manifest }) => manifest.category === category),
    }))
    .filter((group) => group.tools.length > 0)
}

/**
 * Whether every published tool runs in the browser, so the home page may say that files never
 * leave the device. A `server` tool (ADR 0006) turns those claims off.
 */
export function allToolsInBrowser(registered: readonly RegisteredTool[]): boolean {
  return registered.length > 0 && registered.every(({ manifest }) => manifest.runtime === 'browser')
}
