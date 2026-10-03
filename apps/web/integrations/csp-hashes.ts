/**
 * Astro integration: keeps the Content-Security-Policy in `_headers` strict without
 * `'unsafe-inline'`.
 *
 * Astro islands add a few small inline `<script>` and `<style>` elements. After the build this
 * integration hashes every inline script and style found in the HTML output and appends the
 * hashes to `script-src` / `style-src` in `dist/_headers`. It fails the build on inline event
 * handlers or `style="…"` attributes, which a hash-based policy cannot allow, and on header
 * lines too long for Cloudflare to apply. See ADR 0012.
 *
 * Runs only at build time, in Node. `parse5` is a devDependency and never reaches the client.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import { type DefaultTreeAdapterTypes, parse } from 'parse5'

type Node = DefaultTreeAdapterTypes.Node
type Element = DefaultTreeAdapterTypes.Element

/** Script types the browser treats as data blocks: never executed, so CSP does not apply. */
const DATA_SCRIPT_TYPES = new Set(['application/json', 'application/ld+json'])

export interface InlineHashes {
  scripts: Set<string>
  styles: Set<string>
}

const sha256 = (content: string) =>
  `'sha256-${createHash('sha256').update(content).digest('base64')}'`

const isElement = (node: Node): node is Element => 'tagName' in node

/** The element's raw text, exactly as the browser hashes it for CSP. */
const textOf = (element: Element) =>
  element.childNodes
    .map((child) => ('value' in child && child.nodeName === '#text' ? child.value : ''))
    .join('')

/** Walks every element, including `<template>` contents. Comments are skipped by construction. */
function* elements(node: Node): Generator<Element> {
  if (isElement(node)) {
    yield node
    if ('content' in node) yield* elements(node.content)
  }
  if ('childNodes' in node) for (const child of node.childNodes) yield* elements(child)
}

/**
 * Collects CSP hashes of the inline scripts and styles in one HTML document. The document is
 * parsed with parse5, a spec-compliant HTML parser, so the result matches what browsers see
 * (e.g. `</script >` end tags, markup inside comments).
 */
export function collectInlineHashes(html: string, into: InlineHashes, file = 'page'): InlineHashes {
  for (const element of elements(parse(html))) {
    for (const { name } of element.attrs) {
      if (name.startsWith('on')) throw new Error(`${file}: inline event handlers are not allowed`)
      if (name === 'style') throw new Error(`${file}: style attributes are not allowed`)
    }
    const attribute = (name: string) => element.attrs.find((attr) => attr.name === name)?.value
    if (element.tagName === 'script') {
      const type = attribute('type')?.trim().toLowerCase()
      if (attribute('src') !== undefined || (type && DATA_SCRIPT_TYPES.has(type))) continue
      into.scripts.add(sha256(textOf(element)))
    } else if (element.tagName === 'style') {
      into.styles.add(sha256(textOf(element)))
    }
  }
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

/**
 * Cloudflare ignores `_headers` lines longer than this, which would silently drop the CSP.
 * https://developers.cloudflare.com/workers/static-assets/headers/
 */
export const MAX_HEADER_LINE_LENGTH = 2000

/** Throws if any `_headers` line is too long for Cloudflare to apply. */
export function assertHeaderLineLengths(headers: string): void {
  for (const line of headers.split('\n')) {
    if (line.length > MAX_HEADER_LINE_LENGTH) {
      const name = line.trim().split(':')[0]
      throw new Error(
        `_headers: the ${name} line is ${line.length} characters; Cloudflare ignores lines over ${MAX_HEADER_LINE_LENGTH}`,
      )
    }
  }
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
        const result = addHashesToHeaders(headers, hashes)
        assertHeaderLineLengths(result)
        await writeFile(headersPath, result)
        logger.info(
          `added ${hashes.scripts.size} script and ${hashes.styles.size} style hashes to _headers`,
        )
      },
    },
  }
}
