import { manifest as templateManifest } from '@mochifile/tool-template/manifest'
import { describe, expect, it } from 'vitest'
import { buildToolRoutes, loadTools, toolDirOf, tools } from './tools.ts'

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

describe('buildToolRoutes', () => {
  const registered = loadTools(entries, { includeTemplate: true })

  it('generates one route per tool with the localized slug', () => {
    expect(buildToolRoutes(registered, 'en')[0]?.params).toEqual({ tool: 'template-tool' })
    expect(buildToolRoutes(registered, 'pt')[0]?.params).toEqual({ tool: 'ferramenta-modelo' })
  })

  it('passes every locale path for hreflang', () => {
    expect(buildToolRoutes(registered, 'pt')[0]?.props.paths).toEqual({
      en: '/template-tool/',
      pt: '/pt/ferramenta-modelo/',
    })
  })
})
