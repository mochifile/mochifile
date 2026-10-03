/**
 * Gives every sitemap entry the same `hreflang` alternates as its page.
 *
 * `@astrojs/sitemap`'s own i18n option assumes a page has the same path in every locale
 * (`/x/` ↔ `/pt/x/`), which is wrong for tool pages with translated slugs
 * (`/compress-image/` ↔ `/pt/comprimir-imagem/`). Instead, `serialize()` reads the
 * `<link rel="alternate" hreflang>` tags that each built page already carries (see
 * `BaseLayout.astro`), so the sitemap can never disagree with the pages.
 *
 * Runs only at build time, in Node. `parse5` is a devDependency and never reaches the client.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { SitemapItem } from '@astrojs/sitemap'
import type { AstroIntegration } from 'astro'
import { type DefaultTreeAdapterTypes, parse } from 'parse5'

type Node = DefaultTreeAdapterTypes.Node
type Element = DefaultTreeAdapterTypes.Element

export interface Alternate {
  lang: string
  url: string
}

function* elements(node: Node): Generator<Element> {
  if ('tagName' in node) yield node
  if ('childNodes' in node) for (const child of node.childNodes) yield* elements(child)
}

/** The `hreflang` alternates declared in a page's HTML, in document order. */
export function alternatesFromHtml(html: string): Alternate[] {
  const alternates: Alternate[] = []
  for (const element of elements(parse(html))) {
    if (element.tagName !== 'link') continue
    const attribute = (name: string) => element.attrs.find((attr) => attr.name === name)?.value
    const lang = attribute('hreflang')
    const url = attribute('href')
    if (attribute('rel') === 'alternate' && lang && url) alternates.push({ lang, url })
  }
  return alternates
}

/** Path of the built HTML file for a page URL, e.g. `/pt/x/` → `<outDir>/pt/x/index.html`. */
export function htmlFileFor(pageUrl: string, outDir: URL): URL {
  const { pathname } = new URL(pageUrl)
  const file = pathname.endsWith('/') ? `${pathname}index.html` : `${pathname}.html`
  return new URL(`.${file}`, outDir)
}

/**
 * Returns an integration that records the build's output directory and a `serialize` function
 * for `@astrojs/sitemap`. Both must be registered: the integration before the sitemap.
 */
export default function sitemapAlternates(): {
  integration: AstroIntegration
  serialize: (item: SitemapItem) => Promise<SitemapItem>
} {
  let outDir: URL | undefined
  return {
    integration: {
      name: 'mochifile:sitemap-alternates',
      hooks: {
        'astro:config:done': ({ config }) => {
          outDir = config.outDir
        },
      },
    },
    async serialize(item) {
      if (!outDir) throw new Error('sitemap-alternates: the integration is not registered')
      const html = await readFile(fileURLToPath(htmlFileFor(item.url, outDir)), 'utf8')
      const links = alternatesFromHtml(html)
      return links.length > 0 ? { ...item, links } : item
    },
  }
}
