/**
 * Generates the subset fonts described in fonts.ts (ADR 0021). Run with
 * `pnpm --filter @mochifile/web fonts` after changing CHARSET or FONTS; a unit test fails if the
 * committed files drift from what this produces.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import subsetFont from 'subset-font'
import { CHARSET, FONTS, FONTS_DIR, type SubsetFont } from './fonts.ts'

const require = createRequire(import.meta.url)

export function sourcePath(font: SubsetFont): string {
  return join(dirname(require.resolve(`${font.source.pkg}/LICENSE`)), 'files', font.source.file)
}

export function subset(font: SubsetFont): Promise<Buffer> {
  return subsetFont(readFileSync(sourcePath(font)), CHARSET, {
    targetFormat: 'woff2',
    variationAxes: { wght: font.weight },
  })
}

if (import.meta.main) {
  for (const font of Object.values(FONTS)) {
    const bytes = await subset(font)
    const before = readFileSync(sourcePath(font)).byteLength
    writeFileSync(join(FONTS_DIR, font.output), bytes)
    process.stdout.write(`${font.output}: ${before} → ${bytes.byteLength} bytes\n`)
  }
}
