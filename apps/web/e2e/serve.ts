/**
 * Minimal static server for e2e tests that mimics Cloudflare static assets:
 * - applies `_headers` (so the CSP and security headers are exercised in real browsers),
 *   except what only makes sense over HTTPS: `upgrade-insecure-requests` would make
 *   Firefox and WebKit request https://localhost, and HSTS is ignored over HTTP anyway
 * - serves `<path>/index.html` and redirects `/path` to `/path/`
 * - serves `404.html` with status 404
 *
 * Usage: node e2e/serve.ts <dir> <port>
 */
import { readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

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

type Rule = { pattern: RegExp; headers: Array<[string, string]> }

function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = []
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      const source = line
        .trim()
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
      rules.push({ pattern: new RegExp(`^${source}$`), headers: [] })
      continue
    }
    const separator = line.indexOf(':')
    const name = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (/^strict-transport-security$/i.test(name)) continue
    if (/^content-security-policy$/i.test(name)) {
      value = value.replace(/;\s*upgrade-insecure-requests/, '')
    }
    rules.at(-1)?.headers.push([name, value])
  }
  return rules
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
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
    response.end(readFileSync(file))
    return
  }
  response.writeHead(404, { 'Content-Type': types['.html'] })
  response.end(readFileSync(join(root, '404.html')))
}).listen(port, () => {
  process.stdout.write(`Serving ${root} at http://localhost:${port}\n`)
})
