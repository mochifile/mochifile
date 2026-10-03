import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultLocale, isLocale, localePath, locales } from './index.ts'
import * as compiledMessages from './paraglide/messages.js'
import { baseLocale, locales as paraglideLocales } from './paraglide/runtime.js'

const settings = JSON.parse(
  readFileSync(new URL('../project.inlang/settings.json', import.meta.url), 'utf8'),
) as { baseLocale: string; locales: string[]; modules: string[] }

type Settings = { 'plugin.inlang.messageFormat': { pathPattern: string | string[] } }
const pathPatterns = [
  (settings as unknown as Settings)['plugin.inlang.messageFormat'].pathPattern,
].flat()

/** Reads one message file per path pattern (core messages plus each tool's messages). */
const readMessageFiles = (locale: string) =>
  pathPatterns.map((pattern) => {
    const url = new URL(`../${pattern.replace('{locale}', locale)}`, import.meta.url)
    const messages = JSON.parse(readFileSync(url, 'utf8')) as Record<string, string>
    delete messages.$schema
    return { pattern, keys: Object.keys(messages).sort() }
  })

describe('locale configuration', () => {
  it('matches the inlang project settings', () => {
    expect([...locales]).toEqual(settings.locales)
    expect(defaultLocale).toBe(settings.baseLocale)
  })

  it('matches the compiled Paraglide runtime', () => {
    expect([...locales]).toEqual([...paraglideLocales])
    expect(defaultLocale).toBe(baseLocale)
  })

  it('has the same message keys in every locale', () => {
    const base = readMessageFiles(defaultLocale)
    for (const locale of locales) {
      expect(readMessageFiles(locale), locale).toEqual(base)
    }
  })

  it('loads inlang plugins from local files only, so builds work offline', () => {
    expect(settings.modules.length).toBeGreaterThan(0)
    for (const module of settings.modules) {
      expect(module, module).not.toMatch(/^[a-z]+:\/\//i)
      expect(existsSync(new URL(`../${module}`, import.meta.url)), module).toBe(true)
    }
  })

  it('compiles every message key into a function', () => {
    // Paraglide only warns when a plugin fails to load and then emits no messages.
    const exported = compiledMessages as unknown as Record<string, unknown>
    for (const { pattern, keys } of readMessageFiles(defaultLocale)) {
      for (const key of keys) expect(typeof exported[key], `${key} (${pattern})`).toBe('function')
    }
  })

  it('never defines the same key in two message files', () => {
    const seen = new Map<string, string>()
    for (const { pattern, keys } of readMessageFiles(defaultLocale)) {
      for (const key of keys) {
        expect(seen.get(key), `"${key}" in ${pattern}`).toBeUndefined()
        seen.set(key, pattern)
      }
    }
  })
})

describe('isLocale', () => {
  it('accepts supported locales only', () => {
    expect(isLocale('en')).toBe(true)
    expect(isLocale('pt')).toBe(true)
    expect(isLocale('de')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})

describe('localePath', () => {
  it('does not prefix the default locale', () => {
    expect(localePath('en')).toBe('/')
    expect(localePath('en', '/compress-image')).toBe('/compress-image/')
  })

  it('prefixes other locales', () => {
    expect(localePath('pt')).toBe('/pt/')
    expect(localePath('pt', 'comprimir-imagem')).toBe('/pt/comprimir-imagem/')
    expect(localePath('pt', '/comprimir-imagem/')).toBe('/pt/comprimir-imagem/')
  })

  it('trims any number of leading and trailing slashes but keeps inner ones', () => {
    expect(localePath('en', '///a//b///')).toBe('/a//b/')
    expect(localePath('pt', '////')).toBe('/pt/')
    expect(localePath('en', '')).toBe('/')
  })

  // Regression for CodeQL js/polynomial-redos: a regex trim took quadratic time on long runs
  // of slashes that are not at the end of the string.
  it('runs in linear time on long runs of slashes', () => {
    const slashes = '/'.repeat(200_000)
    const start = performance.now()
    expect(localePath('pt', `${slashes}a${slashes}b`)).toBe(`/pt/a${slashes}b/`)
    expect(localePath('en', `x${slashes}`)).toBe('/x/')
    expect(performance.now() - start).toBeLessThan(500)
  })
})
