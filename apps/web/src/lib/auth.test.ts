// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { locales } from '@mochifile/i18n'
import { describe, expect, it } from 'vitest'
import { authModes, authPaths, authPreviewSteps, authSlugs, authStepId } from './auth.ts'
import { tools } from './tools.ts'

const src = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

describe('account pages', () => {
  it('builds translated paths that end with a slash', () => {
    expect(authPaths('sign-in')).toEqual({ en: '/sign-in/', pt: '/pt/entrar/' })
    expect(authPaths('sign-up')).toEqual({ en: '/sign-up/', pt: '/pt/criar-conta/' })
  })

  it('has lowercase kebab-case slugs, unique within each locale', () => {
    for (const locale of locales) {
      const slugs = authModes.map((mode) => authSlugs[mode][locale])
      expect(new Set(slugs).size).toBe(slugs.length)
      for (const slug of slugs) expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/)
    }
  })

  it('never shares a slug with a tool page, which a route file would shadow', () => {
    const toolSlugs = tools.flatMap(({ manifest }) =>
      locales.flatMap((locale) => [
        manifest.meta[locale].slug,
        ...(manifest.variants ?? []).map((variant) => variant.meta[locale].slug),
      ]),
    )
    for (const mode of authModes) {
      for (const locale of locales) expect(toolSlugs).not.toContain(authSlugs[mode][locale])
    }
  })

  it('has a route file for every page in every locale', () => {
    for (const mode of authModes) {
      for (const locale of locales) {
        const route = `pages/${locale === 'en' ? '' : `${locale}/`}${authSlugs[mode][locale]}.astro`
        expect(existsSync(src(route)), route).toBe(true)
      }
    }
  })

  it('names the preview steps like the ids the page defines', () => {
    const page = readFileSync(src('components/AuthPage.astro'), 'utf8')
    for (const step of authPreviewSteps) expect(authStepId(step)).toBe(`step-${step}`)
    for (const step of authPreviewSteps) expect(page).toContain(`'${step}'`)
  })

  it('has no field that could send or keep what is typed', () => {
    const page = readFileSync(src('components/AuthPage.astro'), 'utf8')
    // No `name=` on a field, no `action`, no script: the forms use method="dialog".
    expect(page).not.toMatch(/<(input|select|textarea)[^>]*\sname=/)
    expect(page).not.toMatch(/<form[^>]*\saction=/)
    expect(page.match(/<form /g)?.length).toBe(page.match(/<form method="dialog"/g)?.length)
    expect(page).not.toMatch(/localStorage|sessionStorage|document\.cookie|<script/)
  })
})
