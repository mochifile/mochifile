// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The V2 pages stay light under a dark system theme by repeating the light value of every colour
 * token on their own wrapper (home.css, pricing.css, ask.css, not-found.css, tool-page-light.css).
 * This checks the wrappers that repeat all of them still match docs/design-system/tokens.json.
 */
const tokens = JSON.parse(
  readFileSync(new URL('../../../../docs/design-system/tokens.json', import.meta.url), 'utf8'),
) as { color: { tokens: Array<{ name: string; value: { light: string } }> } }

describe('tool pages stay light', () => {
  const css = readFileSync(new URL('../styles/tool-page-light.css', import.meta.url), 'utf8')

  it('repeats the light value of every colour token', () => {
    for (const { name, value } of tokens.color.tokens) {
      const light = value.light.startsWith('{') ? `var(--${value.light.slice(1, -1)})` : value.light
      expect(css, name).toContain(`--${name}: ${light};`)
    }
  })

  it('gives its wrapper the page ground at full width', () => {
    expect(css).toContain('background: var(--surface-page)')
    expect(css).toContain('width: 100vw')
  })
})
