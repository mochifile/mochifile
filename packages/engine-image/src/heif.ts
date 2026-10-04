/**
 * Header reading for HEIF-family files (HEIC and AVIF, ADR 0022): the ISO base media file
 * format's `ftyp` brands, and the primary image's size, rotation and alpha from the `meta` box,
 * without decoding. Every read is bounds-checked: the input is untrusted.
 */
import { ToolError } from '@mochifile/tool-kit'

export type HeifFormat = 'heic' | 'avif'

const invalid = (why: string) => new ToolError('invalid-file', `Not a valid image: ${why}`)

const u8 = (b: Uint8Array, i: number) => b[i] ?? 0
const u16 = (b: Uint8Array, i: number) => (u8(b, i) << 8) | u8(b, i + 1)
const u32 = (b: Uint8Array, i: number) => u16(b, i) * 0x10000 + u16(b, i + 2)
const fourcc = (b: Uint8Array, i: number) =>
  String.fromCharCode(u8(b, i), u8(b, i + 1), u8(b, i + 2), u8(b, i + 3))

/** Brands that mean AVIF, and brands of HEVC-coded HEIF (iPhone photos use `heic`). */
const AVIF_BRANDS = new Set(['avif', 'avis'])
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'])
/** Generic HEIF brands: the coding is unknown, and HEVC is by far the most common. */
const HEIF_BRANDS = new Set(['mif1', 'msf1'])

/** The format a file's `ftyp` box declares, or undefined if it is not a HEIF-family file. */
export function detectHeif(bytes: Uint8Array): HeifFormat | undefined {
  if (fourcc(bytes, 4) !== 'ftyp') return undefined
  const size = Math.min(u32(bytes, 0), bytes.length)
  const brands = [fourcc(bytes, 8)]
  for (let i = 16; i + 4 <= size; i += 4) brands.push(fourcc(bytes, i))
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return 'avif'
  if (brands.some((brand) => HEIC_BRANDS.has(brand) || HEIF_BRANDS.has(brand))) return 'heic'
  return undefined
}

interface Box {
  type: string
  /** Start of the payload (after the header), and end of the box. */
  start: number
  end: number
}

/** The boxes directly inside `[start, end)`. Stops at the first malformed box. */
function* children(b: Uint8Array, start: number, end: number): Generator<Box> {
  let offset = start
  while (offset + 8 <= end) {
    let size = u32(b, offset)
    let header = 8
    if (size === 1) {
      // 64-bit size; files bigger than 4 GB are far above any limit, so the high half must be 0.
      if (u32(b, offset + 8) !== 0) return
      size = u32(b, offset + 12)
      header = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < header || offset + size > end) return
    yield { type: fourcc(b, offset + 4), start: offset + header, end: offset + size }
    offset += size
  }
}

const find = (b: Uint8Array, parent: Pick<Box, 'start' | 'end'>, type: string) => {
  for (const box of children(b, parent.start, parent.end)) if (box.type === type) return box
  return undefined
}

/** Payload of a "full box" (version and flags first): the version and where the content starts. */
const full = (b: Uint8Array, box: Box) => ({ version: u8(b, box.start), at: box.start + 4 })

export interface HeifHeader {
  width: number
  height: number
  /** Quarter turns anticlockwise to display the image (`irot`), 0–3. */
  rotation: 0 | 1 | 2 | 3
  /** Whether an alpha plane is declared (the pixels decide in the end). */
  mayHaveAlpha: boolean
}

/** Reads the primary image's header. Throws `ToolError('invalid-file')`. */
export function readHeifHeader(b: Uint8Array): HeifHeader {
  const meta = find(b, { start: 0, end: b.length }, 'meta')
  if (!meta) throw invalid('HEIF without a meta box')
  const inner = { start: meta.start + 4, end: meta.end } // meta is a full box
  const pitm = find(b, inner, 'pitm')
  const iprp = find(b, inner, 'iprp')
  const ipco = iprp && find(b, iprp, 'ipco')
  const ipma = iprp && find(b, iprp, 'ipma')
  if (!pitm || !ipco || !ipma) throw invalid('HEIF without image properties')
  const pitmBox = full(b, pitm)
  const primary = pitmBox.version === 0 ? u16(b, pitmBox.at) : u32(b, pitmBox.at)

  const properties = [...children(b, ipco.start, ipco.end)]
  const associated = associations(b, ipma, primary).map((index) => properties[index - 1])

  let width = 0
  let height = 0
  let rotation: HeifHeader['rotation'] = 0
  for (const property of associated) {
    if (property?.type === 'ispe') {
      const at = full(b, property).at
      width = u32(b, at)
      height = u32(b, at + 4)
    }
    if (property?.type === 'irot') rotation = (u8(b, property.start) & 3) as HeifHeader['rotation']
  }
  if (width === 0 || height === 0) throw invalid('HEIF without dimensions')
  // Alpha is a separate auxiliary image; any alpha `auxC` property in the file is a good hint.
  const mayHaveAlpha = properties.some((property) => {
    if (property.type !== 'auxC') return false
    const urn = String.fromCharCode(...b.subarray(property.start + 4, property.end))
    return urn.includes('auxid:1') || urn.includes('auxiliary:alpha')
  })
  return { width, height, rotation, mayHaveAlpha }
}

/** 1-based indexes into `ipco` of the properties associated with `item`. */
function associations(b: Uint8Array, ipma: Box, item: number): number[] {
  const { version, at } = full(b, ipma)
  const flags = u8(b, ipma.start + 3)
  const count = u32(b, at)
  let offset = at + 4
  for (let i = 0; i < count && offset < ipma.end; i += 1) {
    const id = version < 1 ? u16(b, offset) : u32(b, offset)
    offset += version < 1 ? 2 : 4
    const n = u8(b, offset)
    offset += 1
    const indexes: number[] = []
    for (let j = 0; j < n; j += 1) {
      // Bit 7 marks an essential property; the index is 7 or 15 bits.
      const index = flags & 1 ? u16(b, offset) & 0x7fff : u8(b, offset) & 0x7f
      offset += flags & 1 ? 2 : 1
      indexes.push(index)
    }
    if (id === item) return indexes
  }
  return []
}
