/**
 * Minimal static server for e2e tests that mimics Cloudflare static assets:
 * - applies `_headers` (so the CSP and security headers are exercised in real browsers),
 *   except what only makes sense over HTTPS: `upgrade-insecure-requests` would make
 *   Firefox and WebKit request https://localhost, and HSTS is ignored over HTTP anyway
 * - like Cloudflare, lets a rule that repeats an earlier rule's path replace it (no merging)
 * - serves `<path>/index.html` and redirects `/path` to `/path/`
 * - serves `404.html` with status 404
 * - compresses like Cloudflare does in production (checked against mochifile.com): text, JS,
 *   CSS, JSON, XML, SVG and WebAssembly get brotli at quality 4 when the browser accepts it,
 *   gzip otherwise; fonts and images are sent as they are. Lighthouse runs against this
 *   server (ADR 0021), so it must see the bytes visitors download.
 *
 * Usage: node e2e/serve.ts <dir> <port>
 */
import { readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const root = resolve(process.argv[2] ?? 'dist')
const port = Number(process.argv[3] ?? 4321)

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
}

/** Content types Cloudflare compresses; others (fonts, images) are already compressed. */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.xml', '.txt', '.json', '.wasm'])
const compressed = new Map<string, Buffer>()

/** The file's bytes in the encoding Cloudflare would pick for this request, if any. */
function encode(file: string, request: IncomingMessage): { body: Buffer; encoding?: string } {
  const body = readFileSync(file)
  if (!COMPRESSIBLE.has(extname(file))) return { body }
  const accepted = String(request.headers['accept-encoding'] ?? '')
  const encoding = /\bbr\b/.test(accepted) ? 'br' : /\bgzip\b/.test(accepted) ? 'gzip' : undefined
  if (!encoding) return { body }
  const key = `${encoding}:${file}`
  let out = compressed.get(key)
  if (!out) {
    out =
      encoding === 'br'
        ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
        : gzipSync(body)
    compressed.set(key, out)
  }
  return { body: out, encoding }
}

type Rule = { pattern: RegExp; headers: Array<[string, string]> }

function parseHeaders(text: string): Rule[] {
  const rules = new Map<string, Rule>()
  let current: Rule | undefined
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      const source = line
        .trim()
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
      current = { pattern: new RegExp(`^${source}$`), headers: [] }
      rules.delete(line.trim())
      rules.set(line.trim(), current)
      continue
    }
    const separator = line.indexOf(':')
    const name = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (/^strict-transport-security$/i.test(name)) continue
    if (/^content-security-policy$/i.test(name)) {
      value = value.replace(/;\s*upgrade-insecure-requests/, '')
    }
    current?.headers.push([name, value])
  }
  return [...rules.values()]
}

const rules = parseHeaders(readFileSync(join(root, '_headers'), 'utf8'))

const isFile = (path: string) => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
const isDir = (path: string) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const pathname = decodeURIComponent(url.pathname)
  const target = normalize(join(root, pathname))
  if (!target.startsWith(root)) {
    response.writeHead(400).end()
    return
  }
  for (const rule of rules) {
    if (rule.pattern.test(pathname)) {
      for (const [name, value] of rule.headers) response.setHeader(name, value)
    }
  }
  if (isDir(target) && !pathname.endsWith('/')) {
    response.writeHead(307, { Location: `${pathname}/${url.search}` }).end()
    return
  }
  const file = isDir(target) ? join(target, 'index.html') : target
  if (isFile(file)) {
    const { body, encoding } = encode(file, request)
    response.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      Vary: 'Accept-Encoding',
      ...(encoding ? { 'Content-Encoding': encoding } : {}),
    })
    response.end(body)
    return
  }
  const { body, encoding } = encode(join(root, '404.html'), request)
  response.writeHead(404, {
    'Content-Type': types['.html'],
    Vary: 'Accept-Encoding',
    ...(encoding ? { 'Content-Encoding': encoding } : {}),
  })
  response.end(body)
}).listen(port, () => {
  process.stdout.write(`Serving ${root} at http://localhost:${port}\n`)
})
