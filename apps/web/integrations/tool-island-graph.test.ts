// @vitest-environment node
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { manifestDependencies, runtimeImports, toolsWithUi } from './tool-island-graph.ts'

const realTools = resolve(fileURLToPath(import.meta.url), '../../../../packages/tools')
const cleanup: string[] = []
afterAll(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true })
})

const toolPackage = (id: string) =>
  JSON.stringify({
    name: `@mochifile/tool-${id}`,
    exports: { './manifest': './src/manifest.ts', './ui': './src/Ui.tsx' },
  })
const toolFiles = (id: string): Record<string, string> => ({
  [`${id}/package.json`]: toolPackage(id),
  [`${id}/src/manifest.ts`]: `export const manifest = { id: '${id}' }\nexport interface Options { a: number }\n`,
  [`${id}/src/config.ts`]:
    'export interface Options { a: number }\nexport const config = { accepts: [] }\n',
  [`${id}/src/Ui.tsx`]:
    "import { config } from './config.ts'\nexport default function Ui() { return <p>{String(config.accepts)}</p> }\n",
  [`${id}/src/worker.ts`]: "import { manifest } from './manifest.ts'\nexport const w = manifest\n",
})

/** A tools folder with `demo` and `other`, and `files` written over it (paths from the tools folder). */
function fixture(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'mochifile-tools-'))
  cleanup.push(root)
  const dir = join(root, 'tools')
  for (const [path, text] of Object.entries({
    ...toolFiles('demo'),
    ...toolFiles('other'),
    ...files,
  })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}
const ui = (body: string) => ({
  'demo/src/Ui.tsx': `${body}\nexport default function Ui() { return <p>x</p> }\n`,
})
const found = (files: Record<string, string>) => manifestDependencies(fixture(files))

describe('what the UI keeps at run time (verbatimModuleSyntax)', () => {
  const specifiers = (source: string) => runtimeImports('x.ts', source).map((i) => i.specifier)

  it('erases only a whole `import type` or `export type` declaration', () => {
    expect(specifiers("import type { A } from './a'")).toEqual([])
    expect(specifiers("import type A from './a'")).toEqual([])
    expect(specifiers("import type * as A from './a'")).toEqual([])
    expect(specifiers("export type { A } from './a'")).toEqual([])
    expect(specifiers("export type * from './a'")).toEqual([])
  })

  it('keeps everything else, even when every name is `type` or there is none', () => {
    expect(specifiers("import { type A } from './a'")).toEqual(['./a'])
    expect(specifiers("import { type A, type B } from './a'")).toEqual(['./a'])
    expect(specifiers("import {} from './a'")).toEqual(['./a'])
    expect(specifiers("import './a'")).toEqual(['./a'])
    expect(specifiers("import * as a from './a'")).toEqual(['./a'])
    expect(specifiers("import a from './a'")).toEqual(['./a'])
    expect(specifiers("export * from './a'")).toEqual(['./a'])
    expect(specifiers("export * as a from './a'")).toEqual(['./a'])
    expect(specifiers("export { a } from './a'")).toEqual(['./a'])
    expect(specifiers("export { type A } from './a'")).toEqual(['./a'])
    expect(specifiers("import('./a')")).toEqual(['./a'])
    expect(specifiers("import a = require('./a')")).toEqual(['./a'])
  })

  it('reads statements, not text: comments, strings, templates and JSX text are not imports', () => {
    const source = [
      "// import { manifest } from './manifest.ts'",
      "/* import './manifest.ts' */",
      'const a = "import { manifest } from \'./manifest.ts\'"',
      "const b = `import './manifest.ts'`",
      "const c = <p>import './manifest.ts'</p>",
      "const t: import('./manifest.ts').Options = 1",
    ].join('\n')
    expect(runtimeImports('x.tsx', source)).toEqual([])
  })

  it('does not depend on semicolons or on lines: several statements, one broken over lines', () => {
    const source = [
      "import type { Locale } from '@mochifile/i18n'",
      "import { m } from '@mochifile/i18n/messages'",
      'import {',
      '  type Options,',
      '  manifest as pageData,',
      "} from './manifest.ts'",
      "import { config } from './config.ts'",
    ].join('\n')
    expect(runtimeImports('x.ts', source)).toEqual([
      { specifier: '@mochifile/i18n/messages', names: ['m'] },
      { specifier: './manifest.ts', names: ['manifest'] },
      { specifier: './config.ts', names: ['config'] },
    ])
  })
})

describe('a UI that reaches its manifest', () => {
  // The seven ways the independent review got past the first version of the guard, and more.
  const forbidden: Array<[string, Record<string, string>]> = [
    [
      'inline type: import { type Options } from "./manifest.ts"',
      ui("import { type Options } from './manifest.ts'"),
    ],
    ['no binding: import "./manifest.ts"', ui("import './manifest.ts'")],
    [
      'no extension: import { manifest } from "./manifest"',
      ui("import { manifest } from './manifest'"),
    ],
    [
      'equivalent relative path: "../src/manifest.ts"',
      ui("import { manifest } from '../src/manifest.ts'"),
    ],
    [
      'through a helper',
      {
        ...ui("import { id } from './helper.ts'\nconsole.log(id)"),
        'demo/src/helper.ts':
          "import { manifest } from './manifest.ts'\nexport const id = manifest.id\n",
      },
    ],
    [
      'through a barrel: export * from "./manifest.ts"',
      {
        ...ui("import { manifest } from './barrel.ts'\nconsole.log(manifest)"),
        'demo/src/barrel.ts': "export * from './manifest.ts'\n",
      },
    ],
    [
      'through a barrel: export { manifest } from "./manifest.ts"',
      {
        ...ui("import { manifest } from './barrel.ts'\nconsole.log(manifest)"),
        'demo/src/barrel.ts': "export { manifest } from './manifest.ts'\n",
      },
    ],
    ['namespace: import * as page', ui("import * as page from './manifest.ts'\nconsole.log(page)")],
    ['default: import page from', ui("import page from './manifest.ts'\nconsole.log(page)")],
    ['empty: import {} from', ui("import {} from './manifest.ts'")],
    [
      '.js specifier for a .ts file',
      ui("import { manifest } from './manifest.js'\nconsole.log(manifest)"),
    ],
    [
      'dynamic import("./manifest.ts")',
      ui("const load = () => import('./manifest.ts')\nconsole.log(load)"),
    ],
    ['import = require', ui("import page = require('./manifest.ts')\nconsole.log(page)")],
    [
      'through a barrel with export * as',
      {
        ...ui("import { page } from './barrel.ts'\nconsole.log(page)"),
        'demo/src/barrel.ts': "export * as page from './manifest.ts'\n",
      },
    ],
    [
      'through a barrel with an inline-type re-export, which is kept',
      {
        ...ui("import { type Options } from './barrel.ts'"),
        'demo/src/barrel.ts': "export { type Options } from './manifest.ts'\n",
      },
    ],
    [
      "through a folder's index",
      {
        ...ui("import { manifest } from './lib'\nconsole.log(manifest)"),
        'demo/src/lib/index.ts': "export * from '../manifest.ts'\n",
      },
    ],
    [
      'by the name of its own package: "@mochifile/tool-demo/manifest"',
      ui("import { manifest } from '@mochifile/tool-demo/manifest'\nconsole.log(manifest)"),
    ],
    [
      'the manifest of another tool, by path',
      ui("import { manifest } from '../../other/src/manifest.ts'\nconsole.log(manifest)"),
    ],
    [
      'the manifest of another tool, by package',
      ui("import { manifest } from '@mochifile/tool-other/manifest'\nconsole.log(manifest)"),
    ],
    [
      'multi-line, with an alias and no semicolons',
      ui(
        "import {\n  type Options,\n  manifest as pageData,\n} from './manifest.ts'\nconsole.log(pageData)",
      ),
    ],
    [
      'after a legitimate import and a comment about it',
      ui(
        "import { config } from './config.ts'\n// not the manifest\nimport { manifest } from './manifest.ts'\nconsole.log(config, manifest)",
      ),
    ],
  ]

  it.each(forbidden)('is found: %s', (_name, files) => {
    const violations = found(files)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.every((v) => v.chain[0]?.endsWith('Ui.tsx'))).toBe(true)
    expect(violations.some((v) => v.tool === 'demo')).toBe(true)
    expect(violations.some((v) => v.chain.at(-1)?.endsWith('manifest.ts'))).toBe(true)
  })

  it('says which files it goes through, so the fix is where the import is', () => {
    const [violation] = found({
      ...ui("import { id } from './helper.ts'\nconsole.log(id)"),
      'demo/src/helper.ts': "export { manifest as m } from './manifest.ts'\n",
    })
    expect(violation?.chain).toEqual([
      'tools/demo/src/Ui.tsx',
      'tools/demo/src/helper.ts',
      'tools/demo/src/manifest.ts',
    ])
  })

  it("is found through another tool's UI, which is followed too", () => {
    const violations = found({
      ...ui("import Other from '@mochifile/tool-other/ui'\nconsole.log(Other)"),
      'other/src/Ui.tsx':
        "import { manifest } from './manifest.ts'\nexport default function Ui() { return <p>{manifest.id}</p> }\n",
    })
    expect(violations.map((v) => v.tool).sort()).toEqual(['demo', 'other'])
    expect(violations.find((v) => v.tool === 'demo')?.chain).toEqual([
      'tools/demo/src/Ui.tsx',
      'tools/other/src/Ui.tsx',
      'tools/other/src/manifest.ts',
    ])
  })

  it("is found when it brings the manifest's validation instead", () => {
    const [violation] = found(
      ui(
        "import { defineToolManifest } from '@mochifile/tool-kit'\nconsole.log(defineToolManifest)",
      ),
    )
    expect(violation?.reason).toContain('defineToolManifest')
  })

  it('is found in a tool that did not exist when the guard was written', () => {
    const violations = found({
      ...toolFiles('convert'),
      'convert/src/Ui.tsx':
        "import { manifest } from './manifest.ts'\nexport default () => manifest\n",
    })
    expect(violations.map((v) => v.tool)).toEqual(['convert'])
  })
})

describe('a UI that does not', () => {
  const allowed: Array<[string, Record<string, string>]> = [
    ['nothing but its config (the starting point)', {}],
    [
      'import type { X } from the manifest',
      ui("import type { Options } from './manifest.ts'\nexport type { Options }"),
    ],
    [
      'import type X from the manifest',
      ui("import type Page from './manifest.ts'\nexport type { Page }"),
    ],
    [
      'import type * as M from the manifest',
      ui("import type * as M from './manifest.ts'\nexport type { M }"),
    ],
    [
      'a barrel that only re-exports types of the manifest',
      {
        ...ui("import { type Options } from './barrel.ts'\nexport type { Options }"),
        'demo/src/barrel.ts':
          "export type { Options } from './manifest.ts'\nexport type * from './manifest.ts'\n",
      },
    ],
    [
      'a type of a helper that itself keeps the manifest at run time (the edge is erased)',
      {
        ...ui("import type { Id } from './helper.ts'\nexport type { Id }"),
        'demo/src/helper.ts':
          "import { manifest } from './manifest.ts'\nexport type Id = typeof manifest.id\n",
      },
    ],
    [
      'imports in comments, strings, templates and JSX text',
      ui(
        [
          "// import { manifest } from './manifest.ts'",
          "/* import './manifest.ts' */",
          'const a = "import { manifest } from \'./manifest.ts\'"',
          "const b = `import './manifest.ts'`",
          "const c = <p>import './manifest.ts'</p>",
          'console.log(a, b, c)',
        ].join('\n'),
      ),
    ],
    [
      'its worker, which does import the manifest (it has a bundle of its own)',
      ui(
        "const worker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })\nconsole.log(worker)",
      ),
    ],
    [
      'styles, images, packages and its config, multi-line, with aliases and no semicolons',
      ui(
        [
          "import './panel.css'",
          "import picture from './picture.webp'",
          "import { useState } from 'react'",
          'import {',
          '  type Options,',
          '  config as runtime,',
          "} from './config.ts'",
          "import { config as otherConfig } from '../../other/src/config.ts'",
          'console.log(picture, useState, runtime, otherConfig)',
        ].join('\n'),
      ),
    ],
  ]

  it.each(allowed)('is accepted: %s', (_name, files) => {
    expect(found(files)).toEqual([])
  })

  it('is not asked about files outside its graph, like process.ts and worker.ts', () => {
    expect(
      found({
        'demo/src/process.ts':
          "import { manifest } from './manifest.ts'\nexport const p = manifest\n",
      }),
    ).toEqual([])
  })
})

describe('the folders it looks at', () => {
  it('are the ones with a Ui.tsx, whatever they are called', () => {
    const dir = fixture({
      'convert/src/Ui.tsx': 'export default () => null\n',
      'empty/readme.md': '',
    })
    expect(toolsWithUi(dir).sort()).toEqual(['convert', 'demo', 'other'])
  })
})

// The real code, copied, so that nothing in the repository is ever changed: each way in is
// written into the compressor's own UI, and the guard has to see it there.
describe('on a copy of the real tools', () => {
  const copyOfTools = () => {
    const root = mkdtempSync(join(tmpdir(), 'mochifile-real-tools-'))
    cleanup.push(root)
    const dir = join(root, 'tools')
    cpSync(realTools, dir, {
      recursive: true,
      filter: (path) =>
        !path.includes('node_modules') &&
        !path.includes(`${join(realTools, '_template')}/content`) &&
        (!/\.(webp|png|md|json)$/.test(path) || basename(path) === 'package.json'),
    })
    return dir
  }
  const compressUi = (dir: string) => join(dir, 'compress-image/src/Ui.tsx')
  const anchor = "import { type CompressImageOptions, config } from './config.ts'"

  it('has no way in (this is the real check of the repository, on its copy)', () => {
    expect(manifestDependencies(copyOfTools())).toEqual([])
  })

  const mutations: Array<[string, string, Record<string, string>]> = [
    [
      'inline type',
      "import { type CompressImageOptions as FromManifest } from './manifest.ts'\nexport type { FromManifest }",
      {},
    ],
    ['no binding', "import './manifest.ts'", {}],
    [
      'no extension',
      "import { manifest as pageData } from './manifest'\nconsole.debug(pageData.id)",
      {},
    ],
    [
      'equivalent relative path',
      "import { manifest as pageData } from '../src/manifest.ts'\nconsole.debug(pageData.id)",
      {},
    ],
    [
      'a helper',
      "import { pageId } from './page-id.ts'\nconsole.debug(pageId)",
      {
        'compress-image/src/page-id.ts':
          "import { manifest } from './manifest.ts'\nexport const pageId = manifest.id\n",
      },
    ],
    [
      'export * from a barrel',
      "import { manifest as pageData } from './barrel.ts'\nconsole.debug(pageData.id)",
      { 'compress-image/src/barrel.ts': "export * from './manifest.ts'\n" },
    ],
    [
      'export { manifest } from a barrel',
      "import { manifest as pageData } from './barrel.ts'\nconsole.debug(pageData.id)",
      { 'compress-image/src/barrel.ts': "export { manifest } from './manifest.ts'\n" },
    ],
  ]

  it.each(mutations)('sees it: %s', (_name, code, extra) => {
    const dir = copyOfTools()
    const original = readFileSync(compressUi(dir), 'utf8')
    expect(original).toContain(anchor)
    writeFileSync(compressUi(dir), original.replace(anchor, `${anchor}\n${code}`))
    for (const [path, text] of Object.entries(extra)) writeFileSync(join(dir, path), text)
    const violations = manifestDependencies(dir)
    expect(violations.map((v) => v.tool)).toEqual(['compress-image'])
    expect(violations[0]?.chain[0]).toBe('tools/compress-image/src/Ui.tsx')
    expect(violations[0]?.chain.at(-1)).toBe('tools/compress-image/src/manifest.ts')
  })

  it('does not mind a whole `import type`, in the same place', () => {
    const dir = copyOfTools()
    const original = readFileSync(compressUi(dir), 'utf8')
    writeFileSync(
      compressUi(dir),
      original.replace(
        anchor,
        `${anchor}\nimport type { CompressImageOptions as FromManifest } from './manifest.ts'\nexport type { FromManifest }`,
      ),
    )
    expect(manifestDependencies(dir)).toEqual([])
  })
})
