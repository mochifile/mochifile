// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ToolManifest, ToolRuntimeConfig } from '@mochifile/tool-kit'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { manifestDependencies, toolsWithUi } from '../../integrations/tool-island-graph.ts'

/**
 * A tool's UI is a lazy chunk that every visitor of the tool downloads before touching anything,
 * and the JavaScript budget of that moment is small (ADR 0033, ADR 0034). The manifest is the data
 * of the pages (titles, descriptions and variants in every language) plus its own validation:
 * a UI that reaches it, directly or through any file it imports, ships all of that to the browser.
 * So a UI imports its `config.ts`, which holds what it needs at run time, and the manifest is built
 * from the same file. How the imports are followed, and how the check is itself tested, is in
 * `integrations/tool-island-graph.ts` and its test.
 */

const root = resolve(fileURLToPath(import.meta.url), '../../../../..')
const toolsDir = join(root, 'packages/tools')
const toolDirs = toolsWithUi(toolsDir)

const modules = import.meta.glob<{ manifest?: ToolManifest; config?: ToolRuntimeConfig }>(
  '../../../../packages/tools/*/src/{manifest,config}.ts',
  { eager: true },
)
const moduleOf = (dir: string, file: 'manifest' | 'config') =>
  modules[`../../../../packages/tools/${dir}/src/${file}.ts`]

describe('the UI of every tool', () => {
  it('finds the tools (so the checks below are not vacuous)', () => {
    expect(toolDirs).toContain('compress-image')
    expect(toolDirs).toContain('_template')
  })

  it('covers every tool that has a manifest, and every manifest has a UI to check', () => {
    const withManifest = readdirSync(toolsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
      .filter((entry) => readdirSync(join(toolsDir, entry.name)).includes('src'))
      .filter((entry) => readdirSync(join(toolsDir, entry.name, 'src')).includes('manifest.ts'))
      .map((entry) => entry.name)
    expect(toolDirs.slice().sort()).toEqual(withManifest.sort())
  })

  it('does not reach any manifest at run time (import its config.ts instead, ADR 0034)', () => {
    const violations = manifestDependencies(toolsDir, root)
    expect(
      violations.map((v) => `${v.tool}: ${v.chain.join(' -> ')} (${v.reason})`),
      'a Ui.tsx must not keep an import of a manifest, of any kind, or of a file that does',
    ).toEqual([])
  })

  for (const dir of toolDirs) {
    it(`${dir} has a config.ts, and its manifest is built from it`, () => {
      const config = moduleOf(dir, 'config')?.config
      const manifest = moduleOf(dir, 'manifest')?.manifest
      expect(config, `packages/tools/${dir}/src/config.ts exports \`config\``).toBeDefined()
      expect(manifest).toBeDefined()
      expect(manifest?.accepts).toEqual(config?.accepts)
      expect(manifest?.limits).toEqual(config?.limits)
      expect(manifest?.defaults).toEqual(config?.defaults)
    })
  }
})

describe('what the check relies on', () => {
  it('compiles with verbatimModuleSyntax, which keeps `import { type X } from` at run time', () => {
    const read = ts.readConfigFile(join(root, 'tsconfig.base.json'), ts.sys.readFile)
    expect(read.error).toBeUndefined()
    expect(read.config.compilerOptions.verbatimModuleSyntax).toBe(true)
  })

  it('has shared packages that do not depend on a tool (the guard does not follow packages)', () => {
    const shared = ['ui', 'tool-ui', 'tool-kit', 'engine-image', 'i18n']
    for (const name of shared) {
      const json = JSON.parse(
        readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'),
      ) as {
        dependencies?: Record<string, string>
        peerDependencies?: Record<string, string>
      }
      const names = [
        ...Object.keys(json.dependencies ?? {}),
        ...Object.keys(json.peerDependencies ?? {}),
      ]
      expect(
        names.filter(
          (n) =>
            n.startsWith('@mochifile/tool-') &&
            n !== '@mochifile/tool-kit' &&
            n !== '@mochifile/tool-ui',
        ),
      ).toEqual([])
    }
  })
})
