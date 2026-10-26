import type { ToolManifest } from '@mochifile/tool-kit'
import { manifest as templateManifest } from '@mochifile/tool-template/manifest'
import { describe, expect, it } from 'vitest'
import { footerToolGroups } from './footer.ts'
import type { RegisteredTool } from './tools.ts'

function tool(id: string, category: ToolManifest['category']): RegisteredTool {
  return {
    dir: id,
    manifest: {
      ...templateManifest,
      id,
      category,
      meta: {
        en: { ...templateManifest.meta.en, slug: `${id}-en`, title: `${id} title` },
        pt: { ...templateManifest.meta.pt, slug: `${id}-pt`, title: `${id} título` },
      },
    },
  }
}

describe('footer tool groups', () => {
  it('is empty without tools, so the footer omits the section', () => {
    expect(footerToolGroups([], 'en')).toEqual([])
  })

  it("lists one tool in its category, with the locale's path and title", () => {
    expect(footerToolGroups([tool('compress', 'image')], 'pt')).toEqual([
      { category: 'image', links: [{ href: '/pt/compress-pt/', title: 'compress título' }] },
    ])
    expect(footerToolGroups([tool('compress', 'image')], 'en')[0]?.links[0]?.href).toBe(
      '/compress-en/',
    )
  })

  it('puts several tools of one category in one group, in registry order', () => {
    const groups = footerToolGroups([tool('a', 'image'), tool('b', 'image')], 'en')
    expect(groups).toHaveLength(1)
    expect(groups[0]?.links.map((link) => link.title)).toEqual(['a title', 'b title'])
  })

  it('orders groups by category, not by registry, and skips empty categories', () => {
    const groups = footerToolGroups([tool('p', 'pdf'), tool('i', 'image')], 'en')
    expect(groups.map((group) => group.category)).toEqual(['image', 'pdf'])
  })
})
