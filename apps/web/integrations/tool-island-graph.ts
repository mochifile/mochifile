import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

/**
 * Keeps page data out of the JavaScript that loads with a tool (ADR 0034).
 *
 * A tool's `Ui.tsx` is a chunk every visitor of the tool downloads before touching anything, and
 * the budget of that moment is small (ADR 0033). The tool's manifest, which holds the text of its
 * pages in every language and has its own validation, must not be in it. This follows the imports
 * the UI keeps **at run time**, through the tool's own files and any other tool's, and reports the
 * ways in which it reaches a manifest.
 *
 * What is kept at run time is decided as TypeScript decides it with `verbatimModuleSyntax` (which
 * `tsconfig.base.json` sets, and a test checks): only a whole `import type` or `export type`
 * declaration is erased. `import { type X } from './m'` is kept as `import {} from './m'`, and the
 * module is still loaded and run (measured: +1,948 bytes). So are `import './m'`, `import * as m`,
 * `export * from './m'`, `export { x } from './m'` and `import('./m')`.
 *
 * It reads the syntax tree, so comments, strings and template text are not imports, and it does
 * not depend on semicolons or on how a statement is broken into lines.
 *
 * Not followed: packages outside `packages/tools` (`react`, `@mochifile/tool-ui`…; a test checks
 * that the shared ones do not depend on a tool), `new URL('./worker.ts', import.meta.url)` (a
 * worker has its own bundle, and imports the manifest on purpose), `import.meta.glob`, and files
 * that are not TypeScript (CSS, images).
 */

/** What the UI must not reach: a tool's `manifest.ts`. */
const MANIFEST_FILE = 'manifest.ts'
/** Values that bring the manifest's validation, wherever they are imported from. */
const MANIFEST_MACHINERY = new Set(['defineToolManifest', 'validateManifest', 'assertUniqueTools'])

export interface Violation {
  /** The tool's folder name. */
  tool: string
  /** `Ui.tsx` first, then each file it goes through; the last is the manifest, or the file that imports its machinery. */
  chain: string[]
  reason: string
}

interface ToolPackage {
  name: string
  dir: string
  /** `exports` of its package.json that are plain paths: `./manifest` → file. */
  exports: Map<string, string>
}

/** The folders of `toolsDir` that have a UI. */
export function toolsWithUi(toolsDir: string): string[] {
  return readdirSync(toolsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(toolsDir, name, 'src', 'Ui.tsx')))
}

function toolPackages(toolsDir: string): ToolPackage[] {
  const found: ToolPackage[] = []
  for (const entry of readdirSync(toolsDir, { withFileTypes: true })) {
    const file = join(toolsDir, entry.name, 'package.json')
    if (!entry.isDirectory() || !existsSync(file)) continue
    const json = JSON.parse(readFileSync(file, 'utf8')) as {
      name?: string
      exports?: Record<string, unknown>
    }
    if (!json.name) continue
    const exports = new Map<string, string>()
    for (const [key, value] of Object.entries(json.exports ?? {})) {
      if (typeof value === 'string') exports.set(key, resolve(toolsDir, entry.name, value))
    }
    found.push({ name: json.name, dir: entry.name, exports })
  }
  return found
}

/**
 * The module specifiers a file keeps at run time, and the names it imports from them. Static
 * `import` and `export … from` declarations at the top of the file, and `import('…')` anywhere.
 */
export function runtimeImports(
  fileName: string,
  source: string,
): Array<{ specifier: string; names: string[] }> {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const found: Array<{ specifier: string; names: string[] }> = []
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause
      // `import type …`: erased. Anything else is kept, even when every name in it is `type`.
      if (clause?.isTypeOnly) continue
      const names: string[] = []
      if (clause?.name) names.push('default')
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text)
        }
      }
      found.push({ specifier: statement.moduleSpecifier.text, names })
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      // `export type …`: erased.
      if (statement.isTypeOnly) continue
      const names: string[] = []
      const clause = statement.exportClause
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text)
        }
      }
      found.push({ specifier: statement.moduleSpecifier.text, names })
    } else if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      ts.isStringLiteral(statement.moduleReference.expression)
    ) {
      found.push({ specifier: statement.moduleReference.expression.text, names: [] })
    }
  }
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push({ specifier: node.arguments[0].text, names: [] })
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

/** A relative specifier as the bundler resolves it: with or without extension, or a folder's index. */
function resolveRelative(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier)
  const stems = [base, base.replace(/\.(?:m?js|jsx)$/, '')]
  const candidates = stems.flatMap((stem) => [
    stem,
    `${stem}.ts`,
    `${stem}.tsx`,
    join(stem, 'index.ts'),
    join(stem, 'index.tsx'),
  ])
  return candidates.find((candidate) => /\.tsx?$/.test(candidate) && isFile(candidate))
}

const isFile = (path: string) => existsSync(path) && statSync(path).isFile()

/** A specifier of a tool's package (`@mochifile/tool-x/manifest`) as a file, through its `exports`. */
function resolveToolPackage(specifier: string, packages: ToolPackage[]): string | undefined {
  for (const pkg of packages) {
    if (specifier !== pkg.name && !specifier.startsWith(`${pkg.name}/`)) continue
    const target = pkg.exports.get(`.${specifier.slice(pkg.name.length)}`)
    return target && isFile(target) ? target : undefined
  }
  return undefined
}

/**
 * Every way the UI of every tool of `toolsDir` reaches a manifest at run time. Empty when none
 * does. `root` only shortens the paths in the report.
 */
export function manifestDependencies(toolsDir: string, root = dirname(toolsDir)): Violation[] {
  const packages = toolPackages(toolsDir)
  const insideTools = (file: string) => relative(toolsDir, file).split(/[\\/]/)[0] !== '..'
  const shown = (file: string) => relative(root, file).split('\\').join('/')
  const violations: Violation[] = []

  for (const tool of toolsWithUi(toolsDir)) {
    const entry = resolve(toolsDir, tool, 'src', 'Ui.tsx')
    const parent = new Map<string, string | null>([[entry, null]])
    const queue = [entry]
    const chainTo = (file: string) => {
      const chain: string[] = []
      for (let at: string | null | undefined = file; at; at = parent.get(at))
        chain.unshift(shown(at))
      return chain
    }
    for (let next = queue.shift(); next; next = queue.shift()) {
      if (basename(next) === MANIFEST_FILE && next !== entry) {
        violations.push({
          tool,
          chain: chainTo(next),
          reason: `reaches ${shown(next)} at run time (import its config.ts instead; a whole \`import type\` is fine)`,
        })
        continue
      }
      for (const { specifier, names } of runtimeImports(next, readFileSync(next, 'utf8'))) {
        const machinery = names.filter((name) => MANIFEST_MACHINERY.has(name))
        if (machinery.length > 0) {
          violations.push({
            tool,
            chain: chainTo(next),
            reason: `imports ${machinery.join(', ')}, the manifest's validation, into the UI`,
          })
        }
        const target = specifier.startsWith('.')
          ? resolveRelative(next, specifier)
          : resolveToolPackage(specifier, packages)
        if (target && insideTools(target) && !parent.has(target)) {
          parent.set(target, next)
          queue.push(target)
        }
      }
    }
  }
  return violations
}
