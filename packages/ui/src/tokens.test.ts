// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { colorValue, generateTokensCss, OUTPUT_PATH, readTokens } from '../scripts/tokens.ts'

/**
 * The generated tokens must match docs/design-system/tokens.json, the source of truth
 * (ADR 0020). If this fails after editing tokens.json, run `pnpm --filter @mochifile/ui tokens`.
 */
const tokens = readTokens()
const committed = readFileSync(OUTPUT_PATH, 'utf8')

describe('tokens.generated.css', () => {
  it('is exactly what tokens.json generates (run `pnpm --filter @mochifile/ui tokens`)', () => {
    expect(committed).toBe(generateTokensCss(tokens))
  })

  it('declares every colour in light and dark', () => {
    const block = (selector: string) => {
      const start = committed.indexOf(selector)
      return committed.slice(start, committed.indexOf('}', start))
    }
    const light = block(':root {')
    const forced = block(':root[data-theme="dark"] {')
    const system = block(':root:not([data-theme="light"]) {')
    for (const { name } of tokens.color.tokens) {
      for (const theme of [light, forced, system]) expect(theme).toContain(`--${name}: `)
      expect(committed).toContain(`--color-${name}: var(--${name});`)
    }
  })

  it('exposes every spacing, size, radius and type style', () => {
    for (const { name, value } of [
      ...tokens.spacing.tokens,
      ...tokens.size.tokens,
      ...tokens.radius.tokens,
    ]) {
      expect(committed).toContain(`--${name}: ${value};`)
    }
    for (const group of tokens.type.groups) {
      for (const style of group.styles) expect(committed).toContain(`@utility type-${style.name} {`)
    }
  })

  it('restricts the Tailwind theme to the design system', () => {
    for (const namespace of ['color', 'spacing', 'container', 'radius', 'font', 'text']) {
      expect(committed).toContain(`--${namespace}-*: initial;`)
    }
  })
})

describe('colorValue', () => {
  const names = new Set(['mango-tint'])
  it('resolves aliases to custom properties and keeps raw values', () => {
    expect(colorValue('{mango-tint}', names)).toBe('var(--mango-tint)')
    expect(colorValue('#fff7ec', names)).toBe('#fff7ec')
  })

  it('rejects unknown aliases', () => {
    expect(() => colorValue('{nope}', names)).toThrow(/Unknown colour alias/)
  })
})
