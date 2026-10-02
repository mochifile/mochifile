/**
 * Astro integration: keeps the Content-Security-Policy in `_headers` strict without
 * `'unsafe-inline'`.
 *
 * Astro islands add a few small inline `<script>` and `<style>` elements. After the build this
 * integration hashes every inline script and style found in the HTML output and appends the
 * hashes to `script-src` / `style-src` in `dist/_headers`. It fails the build on inline event
 * handlers or `style="…"` attributes, which a hash-based policy cannot allow. See ADR 0012.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
const STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
const INLINE_HANDLER = /<[^>]+\son[a-z]+\s*=/i
const STYLE_ATTRIBUTE = /<[^>]+\sstyle\s*=/i
/** Script types the browser does not execute, so CSP does not apply to them. */
const DATA_SCRIPT = /\btype\s*=\s*["']?(application\/(ld\+)?json|importmap)/i

export interface InlineHashes {
  scripts: Set<string>
  styles: Set<string>
}

const sha256 = (content: string) =>
  `'sha256-${createHash('sha256').update(content).digest('base64')}'`

/** Collects CSP hashes of the inline scripts and styles in one HTML document. */
export function collectInlineHashes(html: string, into: InlineHashes, file = 'page'): InlineHashes {
  if (INLINE_HANDLER.test(html)) throw new Error(`${file}: inline event handlers are not allowed`)
  if (STYLE_ATTRIBUTE.test(html)) throw new Error(`${file}: style attributes are not allowed`)
  for (const [, attributes = '', content = ''] of html.matchAll(SCRIPT)) {
    if (/\bsrc\s*=/.test(attributes) || DATA_SCRIPT.test(attributes)) continue
    into.scripts.add(sha256(content))
  }
  for (const [, content = ''] of html.matchAll(STYLE)) into.styles.add(sha256(content))
  return into
}

/** Appends hashes to the `script-src` and `style-src` directives of every CSP in `_headers`. */
export function addHashesToHeaders(headers: string, hashes: InlineHashes): string {
  return headers.replace(
    /^(\s*Content-Security-Policy:\s*)(.+)$/gim,
    (_, prefix: string, policy: string) => {
      const directives = policy.split(';').map((directive) => {
        const trimmed = directive.trim()
        const name = trimmed.split(/\s+/)[0]
        const extra =
          name === 'script-src' ? hashes.scripts : name === 'style-src' ? hashes.styles : null
        return extra && extra.size > 0 ? `${trimmed} ${[...extra].sort().join(' ')}` : trimmed
      })
      return `${prefix}${directives.join('; ')}`
    },
  )
}

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => join(entry.parentPath, entry.name))
}

export default function cspHashes(): AstroIntegration {
  return {
    name: 'mochifile:csp-hashes',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir)
        const hashes: InlineHashes = { scripts: new Set(), styles: new Set() }
        for (const file of await htmlFiles(root)) {
          collectInlineHashes(await readFile(file, 'utf8'), hashes, file)
        }
        const headersPath = join(root, '_headers')
        const headers = await readFile(headersPath, 'utf8')
        await writeFile(headersPath, addHashesToHeaders(headers, hashes))
        logger.info(
          `added ${hashes.scripts.size} script and ${hashes.styles.size} style hashes to _headers`,
        )
      },
    },
  }
}
