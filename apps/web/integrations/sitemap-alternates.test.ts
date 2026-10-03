import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import sitemapAlternates, { alternatesFromHtml, htmlFileFor } from './sitemap-alternates.ts'

const page = (links: string) => `<!doctype html><html><head>${links}</head><body></body></html>`
const toolLinks = [
  '<link rel="canonical" href="https://mochifile.com/pt/comprimir-imagem/">',
  '<link rel="alternate" hreflang="en" href="https://mochifile.com/compress-image/">',
  '<link rel="alternate" hreflang="pt" href="https://mochifile.com/pt/comprimir-imagem/">',
  '<link rel="alternate" hreflang="x-default" href="https://mochifile.com/compress-image/">',
].join('')

describe('alternatesFromHtml', () => {
  it('reads every hreflang alternate, including x-default, in order', () => {
    expect(alternatesFromHtml(page(toolLinks))).toEqual([
      { lang: 'en', url: 'https://mochifile.com/compress-image/' },
      { lang: 'pt', url: 'https://mochifile.com/pt/comprimir-imagem/' },
      { lang: 'x-default', url: 'https://mochifile.com/compress-image/' },
    ])
  })

  it('ignores other links and pages without alternates', () => {
    expect(
      alternatesFromHtml(page('<link rel="icon" href="/favicon.svg"><link rel="alternate">')),
    ).toEqual([])
  })
})

describe('htmlFileFor', () => {
  const outDir = new URL('file:///site/dist/')
  it('maps directory URLs to their index.html', () => {
    expect(htmlFileFor('https://mochifile.com/pt/comprimir-imagem/', outDir).href).toBe(
      'file:///site/dist/pt/comprimir-imagem/index.html',
    )
    expect(htmlFileFor('https://mochifile.com/', outDir).href).toBe('file:///site/dist/index.html')
  })
})

describe('serialize', () => {
  let dir: string | undefined
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('adds the page alternates to the sitemap entry', async () => {
    dir = await mkdtemp(join(tmpdir(), 'sitemap-'))
    await mkdir(join(dir, 'pt', 'comprimir-imagem'), { recursive: true })
    await writeFile(join(dir, 'pt', 'comprimir-imagem', 'index.html'), page(toolLinks))
    const { integration, serialize } = sitemapAlternates()
    const configDone = integration.hooks['astro:config:done'] as (options: unknown) => void
    configDone({ config: { outDir: pathToFileURL(`${dir}/`) } })

    const item = await serialize({ url: 'https://mochifile.com/pt/comprimir-imagem/' })
    expect(item.links).toHaveLength(3)
    expect(item.links?.[2]).toEqual({
      lang: 'x-default',
      url: 'https://mochifile.com/compress-image/',
    })
  })

  it('fails loudly if the integration was not registered', async () => {
    const { serialize } = sitemapAlternates()
    await expect(serialize({ url: 'https://mochifile.com/' })).rejects.toThrow(/not registered/)
  })
})
