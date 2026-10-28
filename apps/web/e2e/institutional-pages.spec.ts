import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures.ts'

/**
 * About, Sustainability, Architecture & data handling and Contact, in English and Portuguese.
 * Contact's form is complete but cannot send yet: asking to send must say so and send nothing.
 */

const PAGES = [
  {
    id: 'about',
    en: {
      path: '/about/',
      title: 'About Mochifile — simple file tools for everyone',
      h1: 'About Mochifile',
    },
    pt: {
      path: '/pt/sobre/',
      title: 'Sobre a Mochifile — ferramentas simples de arquivos para todo mundo',
      h1: 'Sobre a Mochifile',
    },
  },
  {
    id: 'sustainability',
    en: { path: '/sustainability/', title: 'Sustainability — Mochifile', h1: 'Sustainability' },
    pt: {
      path: '/pt/sustentabilidade/',
      title: 'Sustentabilidade — Mochifile',
      h1: 'Sustentabilidade',
    },
  },
  {
    id: 'architecture',
    en: {
      path: '/architecture/',
      title: 'Architecture and data handling — Mochifile',
      h1: 'Architecture & data handling',
    },
    pt: {
      path: '/pt/arquitetura/',
      title: 'Arquitetura e tratamento de dados — Mochifile',
      h1: 'Arquitetura e tratamento de dados',
    },
  },
  {
    id: 'contact',
    en: { path: '/contact/', title: 'Contact — Mochifile', h1: 'Get in touch' },
    pt: { path: '/pt/contato/', title: 'Contato — Mochifile', h1: 'Fale com a gente' },
  },
] as const

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]

for (const page of PAGES) {
  for (const locale of ['en', 'pt'] as const) {
    const copy = page[locale]
    const other = locale === 'en' ? 'pt' : 'en'

    test(`${copy.path} has its title, language and alternates`, async ({ page: tab }) => {
      await tab.goto(copy.path)
      await expect(tab).toHaveTitle(copy.title)
      await expect(tab.locator('html')).toHaveAttribute('lang', locale)
      await expect(tab.getByRole('heading', { level: 1 })).toHaveText(copy.h1)
      await expect(tab.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(tab.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new RegExp(`${copy.path}$`),
      )
      await expect(tab.locator(`link[rel="alternate"][hreflang="${other}"]`)).toHaveAttribute(
        'href',
        new RegExp(`${page[other].path}$`),
      )
      await expect(tab.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
        'href',
        new RegExp(`${page.en.path}$`),
      )
      // The language link leads to the same page in the other language.
      await expect(tab.locator('[data-language-switch]').first()).toHaveAttribute(
        'href',
        page[other].path,
      )
      // The CSP forbids inline styles: nothing in the copy may carry one.
      await expect(tab.locator('main [style]')).toHaveCount(0)
    })

    for (const viewport of VIEWPORTS) {
      test(`${copy.path} fits ${viewport.width} px, is accessible and its images load`, async ({
        page: tab,
        request,
      }) => {
        await tab.setViewportSize(viewport)
        await tab.goto(copy.path)
        expect((await new AxeBuilder({ page: tab }).analyze()).violations).toEqual([])
        expect(
          await tab.evaluate(() => document.documentElement.scrollWidth),
          'sideways scrolling',
        ).toBeLessThanOrEqual(viewport.width)
        // Decorative pictures: empty alt, and they really arrive.
        for (const image of await tab.locator('main img').all()) {
          await expect(image).toHaveAttribute('alt', '')
          await image.scrollIntoViewIfNeeded()
          expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
        }
        // Every internal link in the copy works.
        const hrefs = await tab
          .locator('main a[href^="/"]')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
        for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200)
      })
    }
  }
}

test('About points to the architecture page and Architecture states the real limits', async ({
  page,
}) => {
  await page.goto('/about/')
  await page.getByRole('link', { name: 'architecture and data handling' }).click()
  await expect(page).toHaveURL('/architecture/')
  const main = page.getByRole('main')
  await expect(main).toContainText('up to 20 photos at a time, 50 MB each')
  await expect(main).toContainText('Images over 100 megapixels')
  await expect(main).toContainText("connect-src 'self'")
  // The policy shown is the policy sent.
  const policy = await page.locator('pre.csp-policy').innerText()
  const sent = (await page.request.get('/architecture/')).headers()['content-security-policy'] ?? ''
  for (const directive of [
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ]) {
    expect(policy).toContain(directive)
    expect(sent).toContain(directive)
  }
})

test('Sustainability makes no claim it cannot back', async ({ page }) => {
  await page.goto('/sustainability/')
  const text = await page.getByRole('main').innerText()
  expect(text).toContain('not carbon neutral')
  expect(text).not.toMatch(/renewable|100%|carbon[- ]negative/i)
})

const CONTACT = {
  en: {
    path: '/contact/',
    form: 'Contact form',
    topic: 'Topic',
    name: 'Name',
    email: 'Email',
    message: 'Message',
    send: 'Send message',
    choice: 'A general question',
    errors: [
      'Choose a topic.',
      'Enter your name.',
      'Enter an email address like you@example.com.',
      'Write a message.',
    ],
    notice: 'Not available yet',
    close: 'Close',
  },
  pt: {
    path: '/pt/contato/',
    form: 'Formulário de contato',
    topic: 'Assunto',
    name: 'Nome',
    email: 'E-mail',
    message: 'Mensagem',
    send: 'Enviar mensagem',
    choice: 'Uma dúvida geral',
    errors: [
      'Escolha um assunto.',
      'Digite seu nome.',
      'Digite um e-mail como voce@exemplo.com.',
      'Escreva uma mensagem.',
    ],
    notice: 'Ainda não está disponível',
    close: 'Fechar',
  },
} as const

for (const locale of ['en', 'pt'] as const) {
  const copy = CONTACT[locale]

  test(`the ${locale} contact form shows what is missing and never pretends to send`, async ({
    page,
  }) => {
    const requests: string[] = []
    await page.goto(copy.path)
    // Lazy images may still arrive; what must not happen is a navigation or any non-GET request.
    page.on('request', (request) => {
      if (request.method() !== 'GET' || request.isNavigationRequest()) {
        requests.push(`${request.method()} ${request.url()}`)
      }
    })
    const form = page.getByRole('form', { name: copy.form })
    const topic = form.getByLabel(copy.topic)
    const name = form.getByLabel(copy.name)
    const email = form.getByLabel(copy.email)
    const message = form.getByLabel(copy.message)
    const notice = page.locator('#contact-unavailable')
    const send = form.getByRole('button', { name: copy.send })

    // Nothing is flagged before the visitor has done anything.
    await expect(send).toBeVisible()
    for (const error of copy.errors) await expect(form.getByText(error)).toBeHidden()

    // Asking to send an empty form: the browser reports the first missing field, every
    // empty field is flagged with its own message, and the notice stays closed.
    await send.click()
    await expect(topic).toBeFocused()
    for (const error of copy.errors) await expect(form.getByText(error)).toBeVisible()
    await expect(notice).toBeHidden()

    // A malformed address is still flagged.
    await topic.selectOption({ label: copy.choice })
    await name.fill('Ada')
    await email.fill('not an address')
    await message.fill('Hello')
    await send.click()
    await expect(email).toBeFocused()
    await expect(form.getByText(copy.errors[2])).toBeVisible()
    await expect(notice).toBeHidden()

    // A complete form: the notice says it is not available, and nothing leaves the page.
    await email.fill('ada@example.com')
    for (const error of copy.errors) await expect(form.getByText(error)).toBeHidden()
    await send.click()
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(copy.notice)
    await expect(notice.getByRole('link', { name: 'hello@mochifile.com' })).toHaveAttribute(
      'href',
      'mailto:hello@mochifile.com',
    )
    expect(page.url()).toMatch(new RegExp(`${copy.path}$`))
    expect(requests).toEqual([])
    // What was typed is still there, and the notice can be dismissed.
    await expect(message).toHaveValue('Hello')
    await notice.getByRole('button', { name: copy.close }).click()
    await expect(notice).toBeHidden()
    // The form sends no field anywhere: none has a name.
    expect(await form.locator('[name]').count()).toBe(0)
    expect(await form.getAttribute('action')).toBeNull()
  })

  test(`the ${locale} contact form works with the keyboard alone`, async ({
    page,
    browserName,
  }) => {
    await page.goto(copy.path)
    const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'
    const form = page.getByRole('form', { name: copy.form })
    await form.getByLabel(copy.topic).focus()
    await page.keyboard.press(tab)
    await expect(form.getByLabel(copy.name)).toBeFocused()
    await page.keyboard.type('Ada')
    await page.keyboard.press(tab)
    await page.keyboard.type('ada@example.com')
    await page.keyboard.press(tab)
    await page.keyboard.type('Hello')
    await form.getByLabel(copy.topic).selectOption({ label: copy.choice })
    await page.keyboard.press(tab)
    const send = form.getByRole('button', { name: copy.send })
    await expect(send).toBeFocused()
    expect(await send.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
    await page.keyboard.press('Enter')
    await expect(page.locator('#contact-unavailable')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#contact-unavailable')).toBeHidden()
  })
}
