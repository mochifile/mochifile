// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Design guard (ADR 0020): colours, sizes and radii come from docs/design-system/tokens.json,
 * never from values typed into the code. Scans code and style files only: SVG illustrations
 * and license texts legitimately contain hex colours.
 */

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../../..')
const ROOTS = ['apps/web/src', 'packages']
const EXTENSIONS = new Set(['.ts', '.tsx', '.astro', '.css'])
/** Folders never scanned: dependencies, generated messages, build output. */
const SKIP_DIRS = new Set(['node_modules', 'paraglide', 'dist', '.astro', 'scripts'])
/** The only files allowed to hold raw values: the generated tokens and the component constants. */
const ALLOWED_FILES = new Set([
  'packages/ui/src/tokens.generated.css',
  'packages/ui/src/component-constants.css',
])

const RULES: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'raw hex colour',
    pattern: /(?<![\w&#])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi,
  },
  { name: 'raw colour function', pattern: /\b(?:rgba?|hsla?|oklch|oklab|lch|hwb)\(/g },
  {
    // `top-[calc(var(--space-4)+env(safe-area-inset-top))]` is fine; `min-h-[30rem]` is not.
    name: 'arbitrary Tailwind value with a raw length or colour',
    pattern: /-\[[^\]\s]*?(?:(?<![\w-])\d*\.?\d+(?:px|rem|em|vh|vw|dvh|svh|ch|%)|#)[^\]\s]*\]/g,
  },
]

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* sourceFiles(join(dir, entry.name))
    } else if (EXTENSIONS.has(extname(entry.name)) && !/\.test\.tsx?$/.test(entry.name)) {
      yield join(dir, entry.name)
    }
  }
}

/** Every violation as `path:line  rule  match`. */
export function findViolations(text: string, path: string): string[] {
  const found: string[] = []
  text.split('\n').forEach((line, index) => {
    for (const rule of RULES) {
      for (const match of line.matchAll(rule.pattern)) {
        found.push(`${path}:${index + 1}  ${rule.name}  ${match[0]}`)
      }
    }
  })
  return found
}

describe('design guard', () => {
  it('finds no raw colours or arbitrary sizes outside the token files', () => {
    const violations = ROOTS.flatMap((root) =>
      [...sourceFiles(join(repoRoot, root))].flatMap((file) => {
        const path = relative(repoRoot, file)
        return ALLOWED_FILES.has(path) ? [] : findViolations(readFileSync(file, 'utf8'), path)
      }),
    )
    expect(violations).toEqual([])
  })

  it('catches what it is meant to catch', () => {
    const sample = [
      "const a = 'bg-[#ff0000]'",
      'color: #fff;',
      'background: rgb(0 0 0);',
      'fill: oklch(70% 0.1 80);',
      '<div class="min-h-[30rem] w-[12px]">',
    ].join('\n')
    expect(findViolations(sample, 'x.tsx').map((found) => found.split('  ')[0])).toEqual([
      // A hex colour in an arbitrary value breaks two rules.
      'x.tsx:1',
      'x.tsx:1',
      'x.tsx:2',
      'x.tsx:3',
      'x.tsx:4',
      'x.tsx:5',
      'x.tsx:5',
    ])
  })

  it('lets token-based and safe-area values through', () => {
    const sample = [
      '<a href="#main">',
      'class="top-[calc(var(--space-4)+env(safe-area-inset-top))] has-[a.tool-link:hover]:border-ink"',
      "'[&::-webkit-progress-value]:bg-action'",
      'color: var(--ink);',
    ].join('\n')
    expect(findViolations(sample, 'x.astro')).toEqual([])
  })
})
