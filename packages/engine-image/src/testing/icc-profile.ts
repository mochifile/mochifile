/**
 * Test-only builders for ICC profiles and the HEIF boxes that carry them, so malformed inputs
 * can be made byte by byte. Never imported by production code.
 */

export interface Tag {
  name: string
  body: number[]
}

export const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))
export const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
export const u16 = (v: number) => [(v >>> 8) & 255, v & 255]
export const s15 = (v: number) => Math.round(v * 65536)

/** An `XYZ ` tag body. */
export const xyz = (x: number, y: number, z: number) => [
  ...ascii('XYZ '),
  ...u32(0),
  ...u32(s15(x)),
  ...u32(s15(y)),
  ...u32(s15(z)),
]

/** A `curv` tag with a single gamma value (u8Fixed8). */
export const gamma = (g: number) => [
  ...ascii('curv'),
  ...u32(0),
  ...u32(1),
  ...u16(Math.round(g * 256)),
  0,
  0,
]

/** A `curv` tag with a table of 16-bit entries. */
export const curveTable = (entries: number[]) => [
  ...ascii('curv'),
  ...u32(0),
  ...u32(entries.length),
  ...entries.flatMap(u16),
]

/** A `para` tag of function `kind` with parameters in the order of ICC.1 (g, a, b, c, d, e, f). */
export const para = (kind: number, params: number[]) => [
  ...ascii('para'),
  ...u32(0),
  ...u16(kind),
  0,
  0,
  ...params.flatMap((v) => u32(s15(v))),
]

/** The sRGB transfer curve as a `para` tag of function type 3. */
export const srgbPara = () => para(3, [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045])

export interface HeaderOptions {
  space?: string
  pcs?: string
  /** Four bytes: major, minor/bugfix, 0, 0. */
  version?: number[]
  /** Profile/device class. */
  cls?: string
}

/** Builds a minimal ICC profile from tags, with a valid header and tag table. */
export function iccProfile(
  tags: Tag[],
  { space = 'RGB ', pcs = 'XYZ ', version = [2, 0x40, 0, 0], cls = 'mntr' }: HeaderOptions = {},
): Uint8Array {
  let offset = 132 + tags.length * 12
  const table: number[] = []
  const data: number[] = []
  for (const tag of tags) {
    table.push(...ascii(tag.name), ...u32(offset), ...u32(tag.body.length))
    data.push(...tag.body)
    offset += tag.body.length
  }
  const bytes = new Uint8Array(132 + tags.length * 12 + data.length)
  bytes.set(u32(bytes.length), 0)
  bytes.set(version, 8)
  bytes.set(ascii(cls), 12)
  bytes.set(ascii(space), 16)
  bytes.set(ascii(pcs), 20)
  bytes.set(ascii('acsp'), 36)
  bytes.set(u32(tags.length), 128)
  bytes.set(table, 132)
  bytes.set(data, 132 + tags.length * 12)
  return bytes
}

type Colorants = [number[], number[], number[]]

// Colorants adapted to the D50 white of the ICC connection space.
export const SRGB_D50: Colorants = [
  [0.4360747, 0.2225045, 0.0139322],
  [0.3850649, 0.7168786, 0.0971045],
  [0.1430804, 0.0606169, 0.7141733],
]
export const ADOBE_RGB_D50: Colorants = [
  [0.60974, 0.31111, 0.01947],
  [0.20528, 0.62567, 0.06087],
  [0.14919, 0.06322, 0.74457],
]

const xyzTag = (name: string, [x = 0, y = 0, z = 0]: number[]): Tag => ({
  name,
  body: xyz(x, y, z),
})

/** The tags of a matrix/TRC profile; `curve` is one tone-curve body used for all channels. */
export function matrixTags([r, g, b]: Colorants, curve: number[]): Tag[] {
  return [
    xyzTag('rXYZ', r),
    xyzTag('gXYZ', g),
    xyzTag('bXYZ', b),
    { name: 'rTRC', body: curve },
    { name: 'gTRC', body: curve },
    { name: 'bTRC', body: curve },
  ]
}

export const matrixProfile = (
  colorants: Colorants,
  curve: number[],
  extra: Tag[] = [],
  header?: HeaderOptions,
): Uint8Array => iccProfile([...matrixTags(colorants, curve), ...extra], header)

/** An ISO base media box. */
export const box = (type: string, ...payload: number[][]): number[] => {
  const body = payload.flat()
  return [...u32(8 + body.length), ...ascii(type), ...body]
}

export interface HeifOptions {
  /** Item id of the primary image (`pitm`). */
  primary?: number
  /** `colr` and other property boxes, in `ipco` order (index 1 is the first). */
  properties: number[][]
  /** `ipma` entries: item id and 1-based property indexes. */
  associations: Array<{ item: number; indexes: number[] }>
  /** `ipma` flags bit 0: 15-bit property indexes. */
  wideIndexes?: boolean
  /** `pitm` version 1 has a 32-bit item id. */
  pitmVersion?: 0 | 1
  /** Replaces the association count of `ipma`, to describe a lie. */
  associationCount?: number
}

/** A `colr` property of type `prof` (or another 4-character type) with a payload. */
export const colr = (type: string, payload: Iterable<number>) =>
  box('colr', ascii(type), [...payload])

/** A minimal HEIF file with just the boxes `readHeifIccProfile` reads. */
export function heifFile({
  primary = 1,
  properties,
  associations,
  wideIndexes = false,
  pitmVersion = 0,
  associationCount,
}: HeifOptions): Uint8Array {
  const pitm = box('pitm', [pitmVersion, 0, 0, 0], pitmVersion === 0 ? u16(primary) : u32(primary))
  const entries = associations.flatMap(({ item, indexes }) => [
    ...u16(item),
    indexes.length,
    ...indexes.flatMap((index) => (wideIndexes ? u16(index) : [index])),
  ])
  const ipma = box(
    'ipma',
    [0, 0, 0, wideIndexes ? 1 : 0],
    u32(associationCount ?? associations.length),
    entries,
  )
  const iprp = box('iprp', box('ipco', ...properties), ipma)
  const meta = box('meta', [0, 0, 0, 0], pitm, iprp)
  const ftyp = box('ftyp', ascii('heic'), u32(0), ascii('heic'))
  return new Uint8Array([...ftyp, ...meta])
}
