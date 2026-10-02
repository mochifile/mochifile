import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultLocale, isLocale, localePath, locales } from './index.ts'
import { baseLocale, locales as paraglideLocales } from './paraglide/runtime.js'

const settings = JSON.parse(
  readFileSync(new URL('../project.inlang/settings.json', import.meta.url), 'utf8'),
) as { baseLocale: string; locales: string[] }

const readMessages = (locale: string) =>
  JSON.parse(
    readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'),
  ) as Record<string, string>

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
    const baseKeys = Object.keys(readMessages(defaultLocale)).sort()
    for (const locale of locales) {
      expect(Object.keys(readMessages(locale)).sort(), locale).toEqual(baseKeys)
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
    expect(localePath('en', '/compress-image')).toBe('/compress-image')
  })

  it('prefixes other locales', () => {
    expect(localePath('pt')).toBe('/pt/')
    expect(localePath('pt', 'comprimir-imagem')).toBe('/pt/comprimir-imagem')
  })
})
