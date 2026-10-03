/**
 * Astro integration: keeps the site out of search engines until launch (ADR 0014).
 *
 * Writes `robots.txt` and, while indexing is blocked, adds `X-Robots-Tag: noindex` for every
 * path to `dist/_headers`. Both follow the single `ALLOW_SEARCH_INDEXING` switch in
 * `apps/web/search-indexing.ts`.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'

export const NOINDEX_HEADER = '  X-Robots-Tag: noindex'

/** `robots.txt` contents: disallow everything before launch, point to the sitemap after it. */
export function robotsTxt(allowIndexing: boolean, site: URL): string {
  if (!allowIndexing) return 'User-agent: *\nDisallow: /\n'
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site)}\n`
}

/**
 * Returns `_headers` with `X-Robots-Tag: noindex` added to the `/*` rule when indexing is
 * blocked. The header joins the existing rule: Cloudflare does not merge two rules with the
 * same path, so a second `/*` rule would replace the security headers instead.
 */
export function applyIndexingHeaders(headers: string, allowIndexing: boolean): string {
  if (allowIndexing) return headers
  const lines = headers.split('\n')
  const rule = lines.findIndex((line) => line.trimEnd() === '/*')
  if (rule === -1) {
    const separator = headers === '' || headers.endsWith('\n') ? '' : '\n'
    return `${headers}${separator}/*\n${NOINDEX_HEADER}\n`
  }
  lines.splice(rule + 1, 0, NOINDEX_HEADER)
  return lines.join('\n')
}

export default function searchIndexing({
  allowIndexing,
}: {
  allowIndexing: boolean
}): AstroIntegration {
  let site: URL | undefined
  return {
    name: 'mochifile:search-indexing',
    hooks: {
      'astro:config:done': ({ config }) => {
        if (config.site === undefined) throw new Error('search-indexing needs `site` to be set')
        site = new URL(config.site)
      },
      'astro:build:done': async ({ dir, logger }) => {
        if (site === undefined) throw new Error('search-indexing: `site` was not resolved')
        const root = fileURLToPath(dir)
        await writeFile(join(root, 'robots.txt'), robotsTxt(allowIndexing, site))
        const headersPath = join(root, '_headers')
        const headers = await readFile(headersPath, 'utf8')
        await writeFile(headersPath, applyIndexingHeaders(headers, allowIndexing))
        if (allowIndexing) logger.info('search engines may index this build')
        else logger.warn('search indexing is blocked (pre-launch, see ADR 0014)')
      },
    },
  }
}
