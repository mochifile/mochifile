// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ToolManifest, ToolRuntimeConfig } from '@mochifile/tool-kit'
import { describe, expect, it } from 'vitest'

/**
 * A tool's UI is a lazy chunk that every visitor of the tool downloads before touching anything,
 * and the JavaScript budget of that moment is small (ADR 0033, ADR 0034). The manifest is the data
 * of the pages (titles, descriptions and variants in every language) plus its own validation:
 * a UI that imports it ships all of that to the browser. So a UI imports its `config.ts`, which
 * holds what it needs at run time, and the manifest is built from the same file.
 */

const toolsDir = resolve(fileURLToPath(import.meta.url), '../../../../../packages/tools')
const toolDirs = readdirSync(toolsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
  .map((entry) => entry.name)
  .filter((name) => readdirSync(join(toolsDir, name, 'src')).includes('Ui.tsx'))

const modules = import.meta.glob<{ manifest?: ToolManifest; config?: ToolRuntimeConfig }>(
  '../../../../packages/tools/*/src/{manifest,config}.ts',
  { eager: true },
)
const moduleOf = (dir: string, file: 'manifest' | 'config') =>
  modules[`../../../../packages/tools/${dir}/src/${file}.ts`]

/**
 * The imports of `source` from `./manifest.ts` that bring a value, not only types. The list of
 * names between `import` and `from` never holds a quote, so a match cannot run over the
 * statement before it (the code has no semicolons to tell them apart).
 */
function valueImportsOfManifest(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(
    /import\s+(type\s+)?([^'"]*?)\s+from\s+['"]\.\/manifest\.ts['"]/g,
  )) {
    if (match[1]) continue
    const specifiers = (match[2] ?? '').replace(/[{}]/g, '').split(',')
    for (const specifier of specifiers.map((s) => s.trim()).filter(Boolean)) {
      if (!specifier.startsWith('type ')) found.push(specifier)
    }
  }
  return found
}

describe('the UI of every tool', () => {
  it('finds the tools (so the checks below are not vacuous)', () => {
    expect(toolDirs).toContain('compress-image')
    expect(toolDirs).toContain('_template')
  })

  for (const dir of toolDirs) {
    describe(dir, () => {
      it('does not import values from its manifest (import its config.ts instead, ADR 0034)', () => {
        const source = readFileSync(join(toolsDir, dir, 'src', 'Ui.tsx'), 'utf8')
        expect(valueImportsOfManifest(source)).toEqual([])
      })

      it('has a config.ts, and the manifest is built from it', () => {
        const config = moduleOf(dir, 'config')?.config
        const manifest = moduleOf(dir, 'manifest')?.manifest
        expect(config, `packages/tools/${dir}/src/config.ts exports \`config\``).toBeDefined()
        expect(manifest).toBeDefined()
        expect(manifest?.accepts).toEqual(config?.accepts)
        expect(manifest?.limits).toEqual(config?.limits)
        expect(manifest?.defaults).toEqual(config?.defaults)
      })
    })
  }

  it('is checked by a rule that does catch the pattern it forbids', () => {
    expect(valueImportsOfManifest("import { manifest } from './manifest.ts'")).toEqual(['manifest'])
    expect(
      valueImportsOfManifest("import { type CompressImageOptions, manifest } from './manifest.ts'"),
    ).toEqual(['manifest'])
    expect(valueImportsOfManifest("import type { X } from './manifest.ts'")).toEqual([])
    expect(valueImportsOfManifest("import { type X, type Y } from './manifest.ts'")).toEqual([])
    expect(valueImportsOfManifest("import { config } from './config.ts'")).toEqual([])
  })

  it('finds it among other statements, with no semicolons and over several lines', () => {
    const source = [
      "import type { Locale } from '@mochifile/i18n'",
      "import { m } from '@mochifile/i18n/messages'",
      'import {',
      '  type CompressImageOptions,',
      '  manifest,',
      "} from './manifest.ts'",
      "import { config } from './config.ts'",
    ].join('\n')
    expect(valueImportsOfManifest(source)).toEqual(['manifest'])
    // A type-only import after a value import of something else is not a violation.
    expect(
      valueImportsOfManifest(
        ["import { config } from './config.ts'", "import type { X } from './manifest.ts'"].join(
          '\n',
        ),
      ),
    ).toEqual([])
  })
})
