/**
 * Test images for the compress-image e2e tests, built in Node with the real codecs from
 * `@mochifile/engine-image/testing`: public-domain photos, files with planted metadata,
 * transparent PNGs, WebP, and very large photos. Nothing personal, nothing committed.
 */
import {
  createNodeEngine,
  exifSegment,
  readHeic,
  readPhoto,
  SECRET,
  syntheticImage,
  withJpegSegments,
} from '@mochifile/engine-image/testing'
import type { Page } from '@playwright/test'

export { SECRET }

export interface UploadFile {
  name: string
  mimeType: string
  buffer: Buffer
}

const engine = createNodeEngine()
const cache = new Map<string, Promise<UploadFile>>()

function cached(key: string, build: () => Promise<UploadFile>): Promise<UploadFile> {
  let file = cache.get(key)
  if (!file) {
    file = build()
    cache.set(key, file)
  }
  return file
}

const upload = (name: string, mimeType: string, bytes: Uint8Array): UploadFile => ({
  name,
  mimeType,
  buffer: Buffer.from(bytes),
})

/** The landscape photo with EXIF holding `SECRET` (like a GPS location). */
export const photoWithLocation = () =>
  cached('location', async () =>
    upload(
      'holiday.jpg',
      'image/jpeg',
      withJpegSegments(await readPhoto('landscape'), exifSegment(1)),
    ),
  )

/** The landscape photo stored sideways with EXIF orientation 6 (displays 798 × 1200). */
export const rotatedPhoto = () =>
  cached('rotated', async () =>
    upload(
      'sideways.jpg',
      'image/jpeg',
      withJpegSegments(await readPhoto('landscape'), exifSegment(6)),
    ),
  )

export const photo = (name: 'landscape' | 'flowers' | 'portrait', fileName = `${name}.jpg`) =>
  cached(`photo:${fileName}`, async () => upload(fileName, 'image/jpeg', await readPhoto(name)))

export const webpPhoto = () =>
  cached('webp', async () => {
    const { codecs } = await engine
    const pixels = await codecs.decode('jpeg', await readPhoto('landscape'))
    return upload('landscape.webp', 'image/webp', await codecs.encodeWebp(pixels, 92))
  })

/** A 400 × 300 PNG whose left half fades to transparent. */
export const transparentPng = () =>
  cached('png', async () => {
    const { codecs } = await engine
    return upload(
      'logo.png',
      'image/png',
      await codecs.encodePng(syntheticImage(400, 300, { alpha: true })),
    )
  })

/** A photo-like JPEG of the given size, e.g. 6000 × 4000 (24 MP) or 8000 × 6000 (48 MP). */
export const largePhoto = (width: number, height: number) =>
  cached(`large:${width}x${height}`, async () => {
    const { codecs } = await engine
    const bytes = await codecs.encodeJpeg(syntheticImage(width, height), 85)
    return upload(`camera-${(width * height) / 1e6}mp.jpg`, 'image/jpeg', bytes)
  })

/** A real iPhone photo (4032 × 3024, rotated: displays 3024 × 4032), metadata blanked. */
export const iphoneHeic = () =>
  cached('heic:iphone', async () =>
    upload('IMG_0001.HEIC', 'image/heic', await readHeic('iphone-grid')),
  )

/** A small HEIC with an empty MIME type, like Windows and Android report for HEIC files. */
export const untypedHeic = () =>
  cached('heic:untyped', async () => upload('IMG_0002.heic', '', await readHeic('synthetic')))

export function bytesContain(bytes: Buffer, text: string): boolean {
  return bytes.includes(Buffer.from(text))
}

export const isJpeg = (bytes: Buffer) => bytes[0] === 0xff && bytes[1] === 0xd8
export const isPng = (bytes: Buffer) => bytes.subarray(1, 4).toString() === 'PNG'
export const isWebp = (bytes: Buffer) =>
  bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'

/**
 * Shows intent the way a person does (pointer over the tool) and waits until the engine has
 * loaded, so no request is pending when a file is chosen.
 */
export async function waitForEngine(page: Page): Promise<void> {
  await page.locator('[data-engine]').hover()
  await page.locator('[data-engine="ready"]').waitFor({ timeout: 30_000 })
}

/** Records every http(s) request from now on. Downloads of results use blob: URLs, not http. */
export function recordRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) urls.push(request.url())
  })
  return urls
}
