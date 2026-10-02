import { expect, test } from './fixtures.ts'

const cases = [
  { path: '/template-tool/', lang: 'en', download: 'Download hello-upper.txt' },
  { path: '/pt/ferramenta-modelo/', lang: 'pt', download: 'Baixar hello-upper.txt' },
]

for (const { path, lang, download } of cases) {
  test(`template tool runs in a Web Worker under the CSP (${lang})`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    const input = page.locator('input[type="file"]')
    await expect(input).toBeAttached()

    await input.setInputFiles({
      name: 'hello.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Olá, Mochifile!'),
    })

    const link = page.getByRole('link', { name: download })
    await expect(link).toHaveAttribute('download', 'hello-upper.txt')
    const [file] = await Promise.all([page.waitForEvent('download'), link.click()])
    const stream = await file.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    expect(Buffer.concat(chunks).toString('utf8')).toBe('OLÁ, MOCHIFILE!')
  })
}

test('template tool rejects unsupported files with a friendly message', async ({ page }) => {
  await page.goto('/template-tool/')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'doc.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF'),
  })
  await expect(page.getByRole('alert')).toHaveText('This file type is not supported.')
})
