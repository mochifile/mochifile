/**
 * Generates `packages/ui/src/tokens.generated.css` from `docs/design-system/tokens.json`, the
 * design system's source of truth (ADR 0020). Run with `pnpm --filter @mochifile/ui tokens`.
 * A unit test regenerates the CSS in memory and fails if the committed file differs.
 *
 * Output:
 * - runtime custom properties: light values on `:root`, dark ones when the system prefers
 *   dark (unless `data-theme="light"`) or when `data-theme="dark"`;
 * - a Tailwind v4 theme restricted to the tokens: no default colours, radii, font sizes or
 *   containers exist, so utilities can only use the design system's values;
 * - one `type-<style>` utility per type style (family, size, line height, weight, tracking).
 */
import { readFileSync, writeFileSync } from 'node:fs'

export interface ColorToken {
  name: string
  value: { light: string; dark: string }
  usage?: string
}

export interface TypeStyle {
  name: string
  fontSize: string
  lineHeight: string
  fontWeight: number
  letterSpacing?: string
}

export interface DesignTokens {
  name: string
  version: number
  color: { tokens: ColorToken[] }
  type: {
    families: Record<string, string>
    groups: Array<{ name: string; family: string; styles: TypeStyle[] }>
  }
  spacing: { tokens: Array<{ name: string; value: string }> }
  radius: { tokens: Array<{ name: string; value: string }> }
  size: { tokens: Array<{ name: string; value: string }> }
}

export const TOKENS_PATH = new URL('../../../docs/design-system/tokens.json', import.meta.url)
export const OUTPUT_PATH = new URL('../src/tokens.generated.css', import.meta.url)

export function readTokens(path: URL = TOKENS_PATH): DesignTokens {
  return JSON.parse(readFileSync(path, 'utf8')) as DesignTokens
}

/** `{mango-tint}` → `var(--mango-tint)`; anything else is used as is. */
export function colorValue(value: string, names: ReadonlySet<string>): string {
  const alias = /^\{([a-z0-9-]+)\}$/.exec(value)
  if (!alias) return value
  const target = alias[1] ?? ''
  if (!names.has(target)) throw new Error(`Unknown colour alias {${target}}`)
  return `var(--${target})`
}

/** Size suffix of a spacing token: `space-4` → `4`. */
const spacingKey = (name: string) => name.replace(/^space-/, '')
/** Key of a radius token: `radius-xl` → `xl`. */
const radiusKey = (name: string) => name.replace(/^radius-/, '')

export function generateTokensCss(tokens: DesignTokens): string {
  const colors = tokens.color.tokens
  const names = new Set(colors.map((token) => token.name))
  const themeBlock = (theme: 'light' | 'dark', indent: string) =>
    [
      `${indent}color-scheme: ${theme};`,
      ...colors.map(
        (token) => `${indent}--${token.name}: ${colorValue(token.value[theme], names)};`,
      ),
    ].join('\n')

  const sizes = [...tokens.spacing.tokens, ...tokens.size.tokens]
  const styles = tokens.type.groups.flatMap((group) =>
    group.styles.map((style) => ({ ...style, family: group.family })),
  )

  const lines = [
    '/*',
    ` * GENERATED from docs/design-system/tokens.json (${tokens.name} v${tokens.version}) by`,
    ' * `pnpm --filter @mochifile/ui tokens`. Do not edit: a test fails if this file drifts from',
    ' * tokens.json (ADR 0020).',
    ' */',
    '',
    '/* Light theme by default. */',
    ':root {',
    themeBlock('light', '  '),
    ...sizes.map((token) => `  --${token.name}: ${token.value};`),
    ...tokens.radius.tokens.map((token) => `  --${token.name}: ${token.value};`),
    ...Object.entries(tokens.type.families).map(([name, value]) => `  --family-${name}: ${value};`),
    '}',
    '',
    '/* Dark theme: by system preference unless data-theme="light", or forced by data-theme="dark". */',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    themeBlock('dark', '    '),
    '  }',
    '}',
    ':root[data-theme="dark"] {',
    themeBlock('dark', '  '),
    '}',
    '',
    '/* Tailwind theme: only the design system values exist. */',
    '@theme inline {',
    '  --color-*: initial;',
    ...colors.map((token) => `  --color-${token.name}: var(--${token.name});`),
    '',
    '  --spacing-*: initial;',
    '  --spacing-0: 0px;',
    ...tokens.spacing.tokens.map(
      (token) => `  --spacing-${spacingKey(token.name)}: var(--${token.name});`,
    ),
    ...tokens.size.tokens
      .filter((token) => !token.name.endsWith('-max'))
      .map((token) => `  --spacing-${token.name}: var(--${token.name});`),
    '',
    '  --container-*: initial;',
    ...tokens.size.tokens
      .filter((token) => token.name.endsWith('-max'))
      .map((token) => `  --container-${token.name}: var(--${token.name});`),
    '',
    '  --radius-*: initial;',
    ...tokens.radius.tokens.map(
      (token) => `  --radius-${radiusKey(token.name)}: var(--${token.name});`,
    ),
    '',
    '  --font-*: initial;',
    ...Object.keys(tokens.type.families).map((name) => `  --font-${name}: var(--family-${name});`),
    '',
    '  --text-*: initial;',
    '}',
    '',
    '/* Type styles: use these instead of separate font size, weight and family utilities. */',
    ...styles.flatMap((style) => [
      `@utility type-${style.name} {`,
      `  font-family: var(--family-${style.family});`,
      `  font-size: ${style.fontSize};`,
      `  line-height: ${style.lineHeight};`,
      `  font-weight: ${style.fontWeight};`,
      ...(style.letterSpacing ? [`  letter-spacing: ${style.letterSpacing};`] : []),
      '}',
    ]),
  ]
  return `${lines.join('\n')}\n`
}

if (import.meta.main) {
  writeFileSync(OUTPUT_PATH, generateTokensCss(readTokens()))
  process.stdout.write(`wrote ${OUTPUT_PATH.pathname}\n`)
}
