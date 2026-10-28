import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isNotFoundPage, moveNotFoundPages } from './locale-not-found.ts'

describe('isNotFoundPage', () => {
  it('matches the 404 page of every locale', () => {
    expect(isNotFoundPage('https://mochifile.com/404/')).toBe(true)
    expect(isNotFoundPage('https://mochifile.com/pt/404/')).toBe(true)
  })

  it('leaves other pages alone, even ones that mention 404', () => {
    expect(isNotFoundPage('https://mochifile.com/')).toBe(false)
    expect(isNotFoundPage('https://mochifile.com/pt/')).toBe(false)
    expect(isNotFoundPage('https://mochifile.com/compress-image/')).toBe(false)
    expect(isNotFoundPage('https://mochifile.com/pt/comprimir-imagem/404/')).toBe(false)
    expect(isNotFoundPage('https://mochifile.com/compress-image-to-404kb/')).toBe(false)
  })
})

describe('moveNotFoundPages', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'locale-not-found-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('moves each locale page to <locale>/404.html, where Cloudflare looks', async () => {
    await mkdir(join(root, 'pt', '404'), { recursive: true })
    await writeFile(join(root, 'pt', '404', 'index.html'), '<html lang="pt">')
    await writeFile(join(root, 'pt', 'index.html'), 'home')

    await moveNotFoundPages(root, ['pt'])

    expect(await readFile(join(root, 'pt', '404.html'), 'utf8')).toBe('<html lang="pt">')
    expect((await readdir(join(root, 'pt'))).sort()).toEqual(['404.html', 'index.html'])
  })

  it('fails the build when a locale has no 404 page', async () => {
    await mkdir(join(root, 'pt'), { recursive: true })
    await expect(moveNotFoundPages(root, ['pt'])).rejects.toThrow('no 404 page for "pt"')
  })
})
