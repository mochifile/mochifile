import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

/** The wordmark's masters (docs/design-system/assets/Logos) and the copies the site ships. */
const MASTERS = new URL('../../../../docs/design-system/assets/Logos/', import.meta.url)
const COPIES = new URL('../assets/logo/', import.meta.url)

const SCHEMES = ['light', 'dark'] as const
const COPY_WIDTHS = [368, 552] as const

/** What the masters were made at; the logo's proportions in global.css come from these. */
const MASTER_SIZE = { light: { width: 960, height: 171 }, dark: { width: 960, height: 173 } }

interface Png {
  width: number
  height: number
  bitDepth: number
  colorType: number
  bytes: number
  /** Alpha of the top-left pixel, whether the file stores it in the pixel or in a palette. */
  cornerAlpha: number
}

function readPng(url: URL): Png {
  const file = readFileSync(url)
  expect(file.subarray(0, 8).toString('hex'), `${url.pathname} is a PNG`).toBe('89504e470d0a1a0a')
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat: Buffer[] = []
  let transparency = Buffer.alloc(0)
  for (let offset = 8; offset < file.length; ) {
    const length = file.readUInt32BE(offset)
    const type = file.toString('ascii', offset + 4, offset + 8)
    const data = file.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data.readUInt8(8)
      colorType = data.readUInt8(9)
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'tRNS') {
      transparency = data
    }
    offset += 12 + length
  }
  // Scanline 0 starts with its filter byte; with no pixel to the left or above, the first
  // pixel is stored as it is under every filter. RGBA keeps alpha in its fourth byte, a palette
  // file keeps it in the tRNS entry its first byte points to (both 8 bits, as asserted below).
  const raw = inflateSync(Buffer.concat(idat))
  const cornerAlpha = colorType === 6 ? (raw[4] ?? 255) : (transparency[raw[1] ?? 0] ?? 255)
  return { width, height, bitDepth, colorType, bytes: file.length, cornerAlpha }
}

describe('the wordmark masters', () => {
  for (const scheme of SCHEMES) {
    const png = readPng(new URL(`mochifile-wordmark-${scheme}.png`, MASTERS))

    it(`${scheme}: is 8-bit RGBA at the size the site pins its proportions to`, () => {
      expect(png.colorType, 'colour type 6 is RGBA').toBe(6)
      expect(png.bitDepth).toBe(8)
      expect({ width: png.width, height: png.height }).toEqual(MASTER_SIZE[scheme])
    })

    it(`${scheme}: has a transparent ground, not a painted one`, () => {
      expect(png.cornerAlpha).toBe(0)
    })

    it(`${scheme}: stays under 150 KB`, () => {
      expect(png.bytes).toBeLessThan(150_000)
    })
  }

  it('the light and dark files are the same lettering at the same scale', () => {
    const ratio = ({ width, height }: { width: number; height: number }) => width / height
    // Two renderings of one drawing: within 2% of each other's proportions.
    expect(Math.abs(ratio(MASTER_SIZE.light) / ratio(MASTER_SIZE.dark) - 1)).toBeLessThan(0.02)
  })
})

describe('the wordmark copies the site ships', () => {
  for (const scheme of SCHEMES) {
    for (const width of COPY_WIDTHS) {
      it(`${scheme} at ${width} px: has alpha, a transparent ground and its master's proportions`, () => {
        const copy = readPng(new URL(`mochifile-wordmark-${scheme}-${width}.png`, COPIES))
        const master = MASTER_SIZE[scheme]
        // RGBA, or a palette with transparency: the copies use a 256-colour palette with no
        // dithering (at most 8/255 off the master on any edge pixel, half the bytes).
        expect([3, 6]).toContain(copy.colorType)
        expect(copy.bitDepth).toBe(8)
        expect(copy.cornerAlpha).toBe(0)
        expect(copy.width).toBe(width)
        // Rounded to whole pixels: at most half a pixel off the master's height.
        expect(Math.abs(copy.height - (width * master.height) / master.width)).toBeLessThanOrEqual(
          0.5,
        )
        expect(copy.bytes, 'a copy is under 30 KB').toBeLessThan(30_000)
      })
    }
  }
})
