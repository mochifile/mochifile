import type { Locale } from '@mochifile/i18n'
import { type ToolCategory, toolCategories } from '@mochifile/tool-kit'
import { type RegisteredTool, toolPaths } from './tools.ts'

export interface FooterToolGroup {
  category: ToolCategory
  links: Array<{ href: string; title: string }>
}

/**
 * The footer's tool links, one group per category that has a tool, from the registry so nothing
 * unreleased is listed. Categories keep the contract's order and tools keep the registry's, so
 * the footer does not reshuffle when a tool is added.
 */
export function footerToolGroups(
  registered: readonly RegisteredTool[],
  locale: Locale,
): FooterToolGroup[] {
  return toolCategories
    .map((category) => ({
      category,
      links: registered
        .filter(({ manifest }) => manifest.category === category)
        .map(({ manifest }) => ({
          href: toolPaths(manifest)[locale],
          title: manifest.meta[locale].title,
        })),
    }))
    .filter((group) => group.links.length > 0)
}
