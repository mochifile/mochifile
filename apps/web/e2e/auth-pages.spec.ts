import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

/**
 * Sign in and Sign up, in English and Portuguese. Accounts do not exist: the forms check what
 * is typed, then say it is not available; nothing is sent, stored or signed in.
 */

const COPY = {
  en: {
    in: { path: '/sign-in/', title: 'Sign in — Mochifile', h1: 'Welcome back', action: 'Sign in' },
    up: {
      path: '/sign-up/',
      title: 'Create your account — Mochifile',
      h1: 'Create your account',
      action: 'Create account',
    },
    other: { in: '/pt/entrar/', up: '/pt/criar-conta/' },
    google: 'Continue with Google',
    googleNotice: 'Signing in with Google is not available yet.',
    accountNotice: 'Accounts are not available yet, so no email was sent and no code was checked.',
    email: 'Email',
    emailError: 'Enter an email address like you@example.com.',
    code: 'Code',
    verify: 'Verify code',
    resend: 'Send a new code',
    preview: {
      code: 'Enter the code',
      checking: 'Checking',
      wrong: 'Wrong code',
      expired: 'Expired code',
      back: 'Back to the form',
    },
    wrong: 'That code is not right. Check it and try again.',
    checking: 'Checking…',
    expired: 'Codes would only work for a short time',
    close: 'Close',
    toUp: 'Create one',
    toIn: 'Sign in',
  },
  pt: {
    in: {
      path: '/pt/entrar/',
      title: 'Entrar — Mochifile',
      h1: 'Bem-vindo de volta',
      action: 'Entrar',
    },
    up: {
      path: '/pt/criar-conta/',
      title: 'Crie sua conta — Mochifile',
      h1: 'Crie sua conta',
      action: 'Criar conta',
    },
    other: { in: '/sign-in/', up: '/sign-up/' },
    google: 'Continuar com o Google',
    googleNotice: 'Entrar com o Google ainda não está disponível.',
    accountNotice:
      'As contas ainda não estão disponíveis, então nenhum e-mail foi enviado e nenhum código foi verificado.',
    email: 'E-mail',
    emailError: 'Digite um e-mail como voce@exemplo.com.',
    code: 'Código',
    verify: 'Verificar código',
    resend: 'Enviar um novo código',
    preview: {
      code: 'Digitar o código',
      checking: 'Verificando',
      wrong: 'Código errado',
      expired: 'Código expirado',
      back: 'Voltar ao formulário',
    },
    wrong: 'Esse código não está certo. Confira e tente de novo.',
    checking: 'Verificando…',
    expired: 'Os códigos só funcionariam por pouco tempo',
    close: 'Fechar',
    toUp: 'Crie uma',
    toIn: 'Entrar',
  },
} as const

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]

/**
 * What the page has stored: cookies, and anything in the browser's storage but the site's own
 * "do not suggest the language again" key, which the tests set so the suggestion banner does
 * not cover the form.
 */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      document.cookie.length +
      sessionStorage.length +
      Object.keys(localStorage).filter((key) => key !== 'mochifile:language-suggestion').length,
  )

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mochifile:language-suggestion', 'off'))
})

/** Requests that would leave the page: a navigation or anything that is not a GET. */
function watchSending(page: Page): string[] {
  const sent: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' || request.isNavigationRequest()) {
      sent.push(`${request.method()} ${request.url()}`)
    }
  })
  return sent
}

for (const locale of ['en', 'pt'] as const) {
  const copy = COPY[locale]
  const other = locale === 'en' ? 'pt' : 'en'

  for (const kind of ['in', 'up'] as const) {
    const page = copy[kind]

    test(`${page.path} has its title, language, alternates and no stored data`, async ({
      page: tab,
    }) => {
      await tab.goto(page.path)
      await expect(tab).toHaveTitle(page.title)
      await expect(tab.locator('html')).toHaveAttribute('lang', locale)
      await expect(tab.getByRole('heading', { level: 1 })).toHaveText(page.h1)
      await expect(tab.locator('link[rel="alternate"][hreflang]')).toHaveCount(3)
      await expect(tab.locator('[data-language-switch]').first()).toHaveAttribute(
        'href',
        copy.other[kind],
      )
      await expect(tab.locator('main [style]')).toHaveCount(0)
      // No field has a name (nothing can be submitted), and no password field exists.
      await expect(tab.locator('main [name]:not([name="description"])')).toHaveCount(0)
      await expect(tab.locator('main input[type="password"]')).toHaveCount(0)
      // The link to the other page of the pair.
      const pair = tab
        .getByRole('main')
        .getByRole('link', { name: kind === 'in' ? COPY[locale].toUp : COPY[locale].toIn })
      await expect(pair).toHaveAttribute(
        'href',
        kind === 'in' ? COPY[locale].up.path : COPY[locale].in.path,
      )
      expect(await stored(tab)).toBe(0)
    })

    test(`${page.path}: Google and the form say they are not available, and send nothing`, async ({
      page: tab,
    }) => {
      await tab.goto(page.path)
      const sent = watchSending(tab)
      const main = tab.getByRole('main')
      const email = main.getByLabel(copy.email, { exact: true })
      const action = main.locator('#step-email').getByRole('button', { name: page.action })

      // Google.
      await main.getByRole('button', { name: copy.google }).click()
      await expect(tab.locator('#auth-google')).toBeVisible()
      await expect(tab.locator('#auth-google')).toContainText(copy.googleNotice)
      await tab.keyboard.press('Escape')
      await expect(tab.locator('#auth-google')).toBeHidden()

      // An empty form: the browser reports the email, the field is flagged, no notice.
      for (const error of [copy.emailError]) await expect(main.getByText(error)).toBeHidden()
      await action.click()
      await expect(email).toBeFocused()
      await expect(main.getByText(copy.emailError)).toBeVisible()
      await expect(tab.locator('#auth-unavailable')).toBeHidden()
      // A malformed address is still flagged.
      await email.fill('not an address')
      await action.click()
      await expect(tab.locator('#auth-unavailable')).toBeHidden()

      // A valid one: the notice says it is not available; no step follows.
      await email.fill('ada@example.com')
      await expect(main.getByText(copy.emailError)).toBeHidden()
      await action.click()
      await expect(tab.locator('#auth-unavailable')).toBeVisible()
      await expect(tab.locator('#auth-unavailable')).toContainText(copy.accountNotice)
      await expect(tab.locator('#step-email')).toBeVisible()
      await expect(tab.locator('#step-code')).toBeHidden()
      expect(new URL(tab.url()).hash).toBe('')
      expect(sent).toEqual([])
      expect(await stored(tab)).toBe(0)
      await tab.locator('#auth-unavailable').getByRole('button', { name: copy.close }).click()
      await expect(tab.locator('#auth-unavailable')).toBeHidden()
    })
  }

  test(`${copy.up.path} keeps the optional fields of the design`, async ({ page }) => {
    await page.goto(copy.up.path)
    const main = page.getByRole('main')
    const use = main.locator('#sign-up-use')
    await expect(use).toBeVisible()
    expect(await use.evaluate((el: HTMLSelectElement) => el.required)).toBe(false)
    await expect(main.getByRole('checkbox')).not.toBeChecked()
    await main.getByRole('checkbox').check()
    await expect(main.getByRole('checkbox')).toBeChecked()
    // Everything the free account is said to give is a promise the page can keep: no numbers.
    await expect(main.getByRole('list').first()).not.toContainText(/\b\d+\s?(MB|files)\b/)
  })

  test(`${copy.in.path}: the preview steps show one screen at a time and say they are previews`, async ({
    page,
  }) => {
    await page.goto(copy.in.path)
    const steps = {
      email: '#step-email',
      code: '#step-code',
      checking: '#step-checking',
      wrong: '#step-wrong',
      expired: '#step-expired',
    }
    const only = async (name: keyof typeof steps) => {
      for (const [key, selector] of Object.entries(steps)) {
        if (key === name) await expect(page.locator(selector)).toBeVisible()
        else await expect(page.locator(selector), `${key} while ${name}`).toBeHidden()
      }
    }
    await only('email')
    const nav = page.getByRole('navigation', { name: /./ }).filter({ hasText: copy.preview.code })

    await nav.getByRole('link', { name: copy.preview.code }).click()
    await only('code')
    await expect(page.locator('#step-code')).toContainText(
      'Preview'.slice(0, 0) + (locale === 'en' ? 'Preview' : 'Prévia'),
    )
    await expect(page.locator('#step-code').getByLabel(copy.code, { exact: true })).toBeEnabled()

    await nav.getByRole('link', { name: copy.preview.checking }).click()
    await only('checking')
    await expect(page.locator('#step-checking').getByRole('progressbar')).toBeVisible()
    await expect(
      page.locator('#step-checking').getByRole('button', { name: copy.checking }),
    ).toBeDisabled()
    await expect(
      page.locator('#step-checking').getByLabel(copy.code, { exact: true }),
    ).toBeDisabled()

    await nav.getByRole('link', { name: copy.preview.wrong }).click()
    await only('wrong')
    await expect(
      page.locator('#step-wrong').getByRole('alert').filter({ hasText: copy.wrong }),
    ).toBeVisible()
    await expect(
      page.locator('#step-wrong').getByLabel(copy.code, { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true')

    await nav.getByRole('link', { name: copy.preview.expired }).click()
    await only('expired')
    await expect(page.locator('#step-expired').getByRole('alert')).toContainText(copy.expired)

    await nav.getByRole('link', { name: copy.preview.back }).click()
    await only('email')
    // A step can be opened by its address, and "Use a different email" goes back.
    await page.goto(`${copy.in.path}#step-wrong`)
    await only('wrong')
  })

  test(`${copy.in.path}: the code is checked before the notice, and nothing is sent`, async ({
    page,
  }) => {
    await page.goto(`${copy.in.path}#step-code`)
    const sent = watchSending(page)
    const step = page.locator('#step-code')
    const input = step.getByLabel(copy.code, { exact: true })
    await expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    await expect(input).toHaveAttribute('inputmode', 'numeric')
    const verify = step.getByRole('button', { name: copy.verify })
    await verify.click()
    await expect(input).toBeFocused()
    await expect(page.locator('#auth-unavailable')).toBeHidden()
    await input.fill('12')
    await verify.click()
    await expect(page.locator('#auth-unavailable')).toBeHidden()
    await input.fill('123456')
    await verify.click()
    await expect(page.locator('#auth-unavailable')).toBeVisible()
    await expect(page.locator('#auth-unavailable')).toContainText(copy.accountNotice)
    await page.keyboard.press('Escape')
    await step.getByRole('button', { name: copy.resend }).click()
    await expect(page.locator('#auth-unavailable')).toBeVisible()
    expect(sent).toEqual([])
    expect(await stored(page)).toBe(0)
  })

  for (const viewport of VIEWPORTS) {
    for (const hash of ['', '#step-code', '#step-checking', '#step-wrong', '#step-expired']) {
      for (const kind of ['in', 'up'] as const) {
        test(`${copy[kind].path}${hash} fits ${viewport.width} px and is accessible`, async ({
          page,
          request,
        }) => {
          await page.setViewportSize(viewport)
          await page.goto(copy[kind].path + hash)
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
            'sideways scrolling',
          ).toBeLessThanOrEqual(viewport.width)
          if (hash === '') {
            for (const image of await page.locator('main img:visible').all()) {
              await expect(image).toHaveAttribute('alt', '')
              await image.scrollIntoViewIfNeeded()
              await expect
                .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
                .toBeGreaterThan(0)
            }
            const hrefs = await page
              .locator('main a[href^="/"]')
              .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
            for (const href of new Set(hrefs))
              expect((await request.get(href)).status(), href).toBe(200)
          }
        })
      }
    }
  }

  test(`${copy.in.path} links to the other language of the same page`, async ({ page }) => {
    await page.goto(copy.in.path)
    await expect(page.locator(`link[rel="alternate"][hreflang="${other}"]`)).toHaveAttribute(
      'href',
      new RegExp(`${copy.other.in}$`),
    )
  })
}
