import { expect, it } from 'vitest'
import { loadNodeCodecs } from './testing/node-codecs.ts'

it('loads every codec in Node', async () => {
  const codecs = await loadNodeCodecs()
  const img = new ImageData(new Uint8ClampedArray(64 * 64 * 4).fill(200), 64, 64)
  const jpg = await codecs.encodeJpeg(img, 80)
  const webp = await codecs.encodeWebp(img, 80)
  const png = await codecs.encodePng(img)
  expect((await codecs.decode('jpeg', jpg)).width).toBe(64)
  expect((await codecs.decode('webp', webp)).width).toBe(64)
  expect((await codecs.decode('png', png)).width).toBe(64)
  expect((await codecs.resize(img, 32, 16)).height).toBe(16)
})
