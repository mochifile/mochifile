// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { formatBytes } from '@mochifile/tool-kit'
import { describe, expect, it } from 'vitest'
import { CHARSET, FONTS, FONTS_DIR } from './fonts.ts'
import { subset } from './subset.ts'

const repoRoot = resolve(FONTS_DIR, '../../..')

/**
 * Characters the site may use although the fonts do not draw them: they come from the next
 * font in the stack. Add one only on purpose.
 */
const FROM_FALLBACK = new Set(['⌘']) // ⌘, in the "paste with ⌘V" hint

/** Every file whose text is shown with the brand fonts. */
function textSources(): string[] {
  const files: string[] = []
  const walk = (dir: string, keep: (file: string) => boolean) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'paraglide') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path, keep)
      else if (keep(path)) files.push(path)
    }
  }
  walk(join(repoRoot, 'packages/i18n/messages'), (file) => extname(file) === '.json')
  walk(join(repoRoot, 'packages/tools'), (file) =>
    /\/messages\/[^/]+\.json$|\/content\/.+\.md$|\/src\/manifest\.ts$/.test(file),
  )
  walk(join(repoRoot, 'apps/web/src'), (file) => extname(file) === '.astro')
  return files
}

describe('brand font subsets', () => {
  it.each(Object.values(FONTS).map((font) => [font.output, font] as const))(
    '%s matches what fonts/subset.ts generates (run `pnpm --filter @mochifile/web fonts`)',
    async (_, font) => {
      const committed = readFileSync(join(FONTS_DIR, font.output))
      expect(Buffer.compare(await subset(font), committed)).toBe(0)
    },
  )

  it('cover every character of the UI messages, page copy, manifests and pages', () => {
    const allowed = new Set([...CHARSET, ...FROM_FALLBACK, '\n', '\r', '\t'])
    const missing = new Map<string, string>()
    const sources = textSources()
    expect(sources.length).toBeGreaterThan(10)
    for (const file of sources) {
      for (const char of readFileSync(file, 'utf8')) {
        if (!allowed.has(char) && !missing.has(char)) missing.set(char, file)
      }
    }
    const report = [...missing].map(
      ([char, file]) =>
        `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')} "${char}" in ${file}`,
    )
    expect(report).toEqual([])
  })

  it('cover formatted file sizes in every locale', () => {
    const text = ['en', 'pt'].flatMap((locale) =>
      [999, 50_000, 1_500_000, 20_000_000].map((bytes) =>
        formatBytes(bytes, locale as 'en' | 'pt'),
      ),
    )
    const outside = [...text.join('')].filter((char) => !CHARSET.includes(char))
    expect(outside).toEqual([])
  })
})
