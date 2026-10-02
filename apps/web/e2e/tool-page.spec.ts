import { expect, test } from './fixtures.ts'

/**
 * Tool pages must be useful to search engines and readable without JavaScript: the title,
 * description and explanatory text are static HTML, and only the interactive widget is a
 * client-only island. Uses the template tool, which is part of the e2e build.
 */
const cases = [
  {
    path: '/template-tool/',
    title: 'Template tool',
    description: 'Example tool that changes the case of a text file. Copy it to build a new tool.',
    about: 'How it works',
    privacy: 'Your files are processed right here in your browser.',
    maxSize: 'Maximum file size: 5 MB.',
    noscript: 'This tool needs JavaScript.',
    widget: 'Choose a text file or drop it here',
  },
  {
    path: '/pt/ferramenta-modelo/',
    title: 'Ferramenta modelo',
    description:
      'Ferramenta de exemplo que muda as letras de um arquivo de texto. Copie-a para criar outra.',
    about: 'Como funciona',
    privacy: 'Seus arquivos são processados aqui mesmo, no seu navegador.',
    maxSize: 'Tamanho máximo do arquivo: 5 MB.',
    noscript: 'Esta ferramenta precisa de JavaScript.',
    widget: 'Escolha um arquivo de texto ou solte-o aqui',
  },
]

for (const c of cases) {
  test.describe(`tool page ${c.path}`, () => {
    test('serves title, description and explanatory text as static HTML', async ({ request }) => {
      const response = await request.get(c.path)
      expect(response.status()).toBe(200)
      const html = await response.text()

      expect(html).toContain(`<title>${c.title} — Mochifile</title>`)
      expect(html).toContain(`<meta name="description" content="${c.description}">`)
      expect(html).toMatch(new RegExp(`<h1[^>]*>${c.title}</h1>`))
      expect(html).toContain(c.description)
      expect(html).toMatch(new RegExp(`<h2[^>]*>${c.about}</h2>`))
      expect(html).toContain(c.privacy)
      expect(html).toContain(c.maxSize)
      // Asserted in the markup: browser automation with JavaScript disabled does not switch the
      // HTML parser to "scripting disabled", so <noscript> content never renders in tests.
      expect(html).toMatch(new RegExp(`<noscript>[\\s\\S]*${c.noscript}[\\s\\S]*</noscript>`))

      // Exactly one island, client-only: the widget itself is not in the server HTML.
      expect(html.match(/<astro-island\b/g)).toHaveLength(1)
      expect(html).toMatch(/<astro-island\b[^>]*\bclient="only"/)
      expect(html).not.toContain(c.widget)
      expect(html).not.toContain('type="file"')
    })

    test('stays readable with JavaScript disabled', async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false })
      const page = await context.newPage()
      await page.goto(c.path)

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(c.title)
      await expect(page.getByText(c.description)).toBeVisible()
      await expect(page.getByRole('heading', { level: 2, name: c.about })).toBeVisible()
      await expect(page.getByText(c.privacy)).toBeVisible()
      await expect(page.locator('input[type="file"]')).toHaveCount(0)
      await context.close()
    })

    test('the widget appears once JavaScript runs', async ({ page }) => {
      await page.goto(c.path)
      await expect(page.getByText(c.widget)).toBeVisible()
      await expect(page.getByText(c.noscript)).toBeHidden()
    })
  })
}
