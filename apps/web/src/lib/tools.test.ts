import { manifest as templateManifest } from '@mochifile/tool-template/manifest'
import { describe, expect, it } from 'vitest'
import {
  assertContentComplete,
  buildToolRoutes,
  contentId,
  loadTools,
  toolDirOf,
  toolPages,
  tools,
} from './tools.ts'

const templatePath = '../../../../packages/tools/_template/src/manifest.ts'
const entries = { [templatePath]: { manifest: templateManifest } }

describe('tool registry', () => {
  it('derives the tool folder from its manifest path', () => {
    expect(toolDirOf(templatePath)).toBe('_template')
    expect(() => toolDirOf('nope.ts')).toThrow()
  })

  it('excludes the template unless asked', () => {
    expect(loadTools(entries, { includeTemplate: false })).toEqual([])
    expect(loadTools(entries, { includeTemplate: true })).toEqual([
      { dir: '_template', manifest: templateManifest },
    ])
  })

  it('discovers every tool package, including the template, during tests', () => {
    expect(tools.map((tool) => tool.dir)).toContain('_template')
  })
})

describe('toolPages', () => {
  const registered = loadTools(entries, { includeTemplate: true })

  it('lists the main page, then each variant, with paths in every locale', () => {
    const pages = toolPages(registered)
    expect(pages.map((page) => page.key)).toEqual(['index', 'lowercase'])
    expect(pages[0]?.variant).toBeNull()
    expect(pages[1]?.variant?.options).toEqual({ mode: 'lower' })
    expect(pages[1]?.paths).toEqual({
      en: '/template-tool-lowercase/',
      pt: '/pt/ferramenta-modelo-minusculas/',
    })
  })
})

describe('buildToolRoutes', () => {
  const registered = loadTools(entries, { includeTemplate: true })

  it('generates one route per page with the localized slug', () => {
    expect(buildToolRoutes(registered, 'en').map((route) => route.params)).toEqual([
      { tool: 'template-tool' },
      { tool: 'template-tool-lowercase' },
    ])
    expect(buildToolRoutes(registered, 'pt').map((route) => route.params)).toEqual([
      { tool: 'ferramenta-modelo' },
      { tool: 'ferramenta-modelo-minusculas' },
    ])
  })

  it('passes every locale path for hreflang', () => {
    expect(buildToolRoutes(registered, 'pt')[0]?.props.page.paths).toEqual({
      en: '/template-tool/',
      pt: '/pt/ferramenta-modelo/',
    })
  })
})

describe('page content', () => {
  const pages = toolPages(loadTools(entries, { includeTemplate: true }))
  const ids = pages.flatMap((page) => [contentId(page, 'en'), contentId(page, 'pt')])

  it('names content by tool folder, locale and page key', () => {
    expect(ids).toEqual([
      '_template/en/index',
      '_template/pt/index',
      '_template/en/lowercase',
      '_template/pt/lowercase',
    ])
  })

  it('passes when every page has copy in every locale', () => {
    expect(() => assertContentComplete(pages, new Set(ids))).not.toThrow()
  })

  it('lists every missing page and locale', () => {
    const available = new Set(ids.filter((id) => !id.endsWith('lowercase')))
    expect(() => assertContentComplete(pages, available)).toThrow(
      /- _template\/en\/lowercase\n- _template\/pt\/lowercase/,
    )
  })
})
