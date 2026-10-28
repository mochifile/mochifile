import type { APIRequestContext } from '@playwright/test'
import { expect, test } from './fixtures.ts'

/**
 * The favicon and the app icons are the "m" app icon of the V2 Home (ADR 0032): cream, a dark
 * "m" and a red and a green dot, cropped from the artboard's raster and never redrawn, so there
 * is no SVG icon. Every page links the same set, in both languages and on the 404 pages.
 */

const PAGES = [
  { path: '/', label: 'English home' },
  { path: '/pt/', label: 'Portuguese home' },
  { path: '/compress-image/', label: 'tool page' },
  { path: '/does-not-exist/', label: 'English 404' },
  { path: '/pt/nao-existe/', label: 'Portuguese 404' },
] as const

const TAB_ICONS = [48, 32, 16]

/** Width and height from a PNG's header, so no browser is needed to know a file's size. */
function pngSize(body: Buffer) {
  expect(body.subarray(0, 8).toString('hex'), 'a PNG file').toBe('89504e470d0a1a0a')
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) }
}

async function linksOf(request: APIRequestContext, path: string) {
  const html = await (await request.get(path)).text()
  const tags = [...html.matchAll(/<link\b[^>]*>/g)].map((match) => match[0])
  const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]
  return tags.map((tag) => ({
    rel: attr(tag, 'rel'),
    href: attr(tag, 'href'),
    sizes: attr(tag, 'sizes'),
    type: attr(tag, 'type'),
  }))
}

for (const { path, label } of PAGES) {
  test(`the ${label} links the "m" icons, each a real PNG of its size, and no SVG icon`, async ({
    request,
  }) => {
    const links = await linksOf(request, path)
    const icons = links.filter((link) => link.rel === 'icon')
    expect(icons.map((link) => link.sizes)).toEqual(TAB_ICONS.map((size) => `${size}x${size}`))
    expect(links.some((link) => link.href?.endsWith('.svg') && /icon/.test(link.rel ?? ''))).toBe(
      false,
    )
    const touch = links.filter((link) => link.rel === 'apple-touch-icon')
    expect(touch).toHaveLength(1)

    const expected = [
      ...icons.map((link) => ({ href: link.href, size: Number.parseInt(link.sizes ?? '0', 10) })),
      { href: touch[0]?.href, size: 180 },
    ]
    for (const { href, size } of expected) {
      expect(href, 'root-relative, so it loads at any depth').toMatch(/^\/[a-z0-9-]+\.png$/)
      const response = await request.get(href ?? '')
      expect(response.status(), href).toBe(200)
      expect(response.headers()['content-type'], href).toBe('image/png')
      expect(pngSize(await response.body()), href).toEqual({ width: size, height: size })
    }

    // The manifest names the 512 px icon, and it loads.
    const manifest = links.find((link) => link.rel === 'manifest')
    const { icons: manifestIcons } = await (await request.get(manifest?.href ?? '')).json()
    expect(manifestIcons).toEqual([{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }])
    const big = await request.get('/icon-512.png')
    expect(big.status()).toBe(200)
    expect(pngSize(await big.body())).toEqual({ width: 512, height: 512 })
  })
}

test('the old SVG favicon is gone and nothing asks for it', async ({ request }) => {
  expect((await request.get('/favicon.svg')).status()).toBe(404)
})

for (const { path, label } of PAGES.slice(0, 2)) {
  test(`a browser loads the ${label}'s icons: cream with a dark "m", not the old mango square`, async ({
    page,
    pageErrors,
  }) => {
    await page.goto(path)
    const pixels = await page.evaluate(async () => {
      const hrefs = [
        ...document.querySelectorAll<HTMLLinkElement>(
          'link[rel~="icon"], link[rel="apple-touch-icon"]',
        ),
      ].map((link) => link.href)
      const out: Record<string, { corner: number[]; centre: number[]; width: number }> = {}
      for (const href of hrefs) {
        const bitmap = await createImageBitmap(await (await fetch(href)).blob())
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('no 2d context')
        context.drawImage(bitmap, 0, 0)
        const at = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)]
        // The corner is plain cream; the left leg of the "m" is dark ink.
        out[href] = {
          corner: at(1, 1),
          centre: at(Math.round(bitmap.width * 0.17), Math.round(bitmap.height * 0.75)),
          width: bitmap.width,
        }
      }
      return out
    })
    expect(Object.keys(pixels)).toHaveLength(4)
    for (const [href, { corner, centre }] of Object.entries(pixels)) {
      // Cream (the old icon's corners were mango: blue channel about 30).
      expect(Math.min(...corner), `${href} corner is cream`).toBeGreaterThan(225)
      // Dark ink in the left leg of the "m".
      expect(Math.max(...centre), `${href} has the dark "m"`).toBeLessThan(140)
    }
    expect(pageErrors).toEqual([])
  })
}
