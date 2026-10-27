/**
 * Colour management for pixels decoded by WebAssembly: converts RGB pixels from the ICC profile
 * embedded in the file to sRGB (ADR 0025).
 *
 * The browser decoders do this themselves (`createImageBitmap` converts to sRGB unless asked
 * not to), but libheif has no colour management: an iPhone photo keeps its Display P3 numbers,
 * and every output format Mochifile writes is untagged, which viewers read as sRGB. Without
 * this the colours of such a photo come out duller than the original.
 *
 * Only matrix/TRC profiles are handled (three colorant tags and three tone curves), which is
 * what phones and cameras embed: Display P3, sRGB, Adobe RGB, ProPhoto. Profiles built on
 * lookup tables, gray or CMYK profiles and anything malformed are left alone, which is what
 * happened to every file before. The profile is untrusted input: every read is bounds-checked.
 */

type Curve = (x: number) => number

interface MatrixProfile {
  /** Row-major 3 × 3 from the profile's linear RGB to XYZ with a D50 white (the ICC PCS). */
  toXyz: number[]
  curves: [Curve, Curve, Curve]
}

/** XYZ (D50) to linear sRGB: the inverse of the D50-adapted sRGB primaries (Bradford). */
// biome-ignore format: a 3 × 3 matrix reads best as rows
const XYZ_D50_TO_LINEAR_SRGB = [
  3.1338561, -1.6168667, -0.4906146,
  -0.9787684, 1.9161415, 0.033454,
  0.0719453, -0.2289914, 1.4052427,
]

const MAX_CURVE_ENTRIES = 65_536
const ENCODE_STEPS = 16_384

const srgbEncode = (linear: number) =>
  linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055

let encodeTable: Uint8Array | undefined
/** Linear light (0–1, in `ENCODE_STEPS` steps) to an 8-bit sRGB value. */
function srgbEncodeTable(): Uint8Array {
  if (!encodeTable) {
    encodeTable = new Uint8Array(ENCODE_STEPS)
    for (let i = 0; i < ENCODE_STEPS; i += 1) {
      encodeTable[i] = Math.round(255 * srgbEncode(i / (ENCODE_STEPS - 1)))
    }
  }
  return encodeTable
}

/** Device classes of profiles that describe an RGB image's colours (not links or abstracts). */
const IMAGE_CLASSES = new Set(['mntr', 'scnr', 'spac', 'prtr'])
/** Lookup-table transforms. When one exists it takes precedence over the matrix: not handled. */
const TABLE_TAGS = ['A2B0', 'A2B1', 'D2B0', 'D2B1']
/** The ICC connection space white (D50) as XYZ. */
const D50_WHITE = [0.9642, 1, 0.8249]

/**
 * Reads the profile's header, tag table, colorants and tone curves. Undefined if the profile is
 * not a plain matrix/TRC RGB profile or does not hold together; it is never trusted.
 */
function parseMatrixProfile(icc: Uint8Array): MatrixProfile | undefined {
  if (icc.length < 132) return undefined
  const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength)
  const sig = (at: number) => String.fromCharCode(...icc.subarray(at, at + 4))
  // The declared size bounds everything below (bytes after it are padding). Version 2 and 4
  // share the layout read here; 5 (iccMAX) does not.
  const size = view.getUint32(0)
  const major = icc[8] ?? 0
  if (size < 132 || size > icc.length || major < 2 || major > 4) return undefined
  // Header: device class, RGB data colour space, an XYZ connection space, 'acsp' signature.
  if (!IMAGE_CLASSES.has(sig(12)) || sig(16) !== 'RGB ' || sig(20) !== 'XYZ ') return undefined
  if (sig(36) !== 'acsp') return undefined

  const count = view.getUint32(128)
  if (count > 256 || 132 + count * 12 > size) return undefined
  const tags = new Map<string, { offset: number; size: number }>()
  for (let i = 0; i < count; i += 1) {
    const entry = 132 + i * 12
    const name = sig(entry)
    const offset = view.getUint32(entry + 4)
    const length = view.getUint32(entry + 8)
    // A repeated tag has no single meaning: readers disagree on which entry wins.
    if (tags.has(name)) return undefined
    if (length >= 8 && offset <= size && length <= size - offset) {
      tags.set(name, { offset, size: length })
    }
  }
  if (TABLE_TAGS.some((name) => tags.has(name))) return undefined

  const s15 = (at: number) => view.getInt32(at) / 65536
  const colorant = (name: string): number[] | undefined => {
    const tag = tags.get(name)
    if (!tag || tag.size < 20 || sig(tag.offset) !== 'XYZ ') return undefined
    return [s15(tag.offset + 8), s15(tag.offset + 12), s15(tag.offset + 16)]
  }
  const r = colorant('rXYZ')
  const g = colorant('gXYZ')
  const b = colorant('bXYZ')
  const curves = ['rTRC', 'gTRC', 'bTRC'].map((name) => {
    const tag = tags.get(name)
    return tag && parseCurve(view, sig, tag.offset, tag.size)
  })
  const [cr, cg, cb] = curves
  if (!r || !g || !b || !cr || !cg || !cb) return undefined
  // Colorants are columns: XYZ = [r g b] · linear RGB. Real ones are non-negative, give or take
  // the rounding of chromatic adaptation (Apple's Display P3 has a Z of -0.001).
  const toXyz = [
    r[0] ?? 0, g[0] ?? 0, b[0] ?? 0,
    r[1] ?? 0, g[1] ?? 0, b[1] ?? 0,
    r[2] ?? 0, g[2] ?? 0, b[2] ?? 0,
  ] // biome-ignore format: 3 × 3 matrix
  if (toXyz.some((v) => !(v >= -0.01 && v <= 2))) return undefined
  return { toXyz, curves: [cr, cg, cb] }
}

/** A tone curve tag (`curv` or `para`) as a function from the encoded to the linear value. */
function parseCurve(
  view: DataView,
  sig: (at: number) => string,
  offset: number,
  size: number,
): Curve | undefined {
  // Both curve types start with a signature, 4 reserved bytes and a count or function type.
  if (size < 12) return undefined
  const type = sig(offset)
  if (type === 'curv') {
    const n = view.getUint32(offset + 8)
    if (n > MAX_CURVE_ENTRIES || 12 + n * 2 > size) return undefined
    if (n === 0) return (x) => x
    if (n === 1) {
      const gamma = view.getUint16(offset + 12) / 256
      return (x) => x ** gamma
    }
    const table = Array.from({ length: n }, (_, i) => view.getUint16(offset + 12 + i * 2) / 65535)
    return (x) => {
      const at = Math.min(Math.max(x, 0), 1) * (n - 1)
      const i = Math.min(Math.floor(at), n - 2)
      const low = table[i] ?? 0
      return low + ((table[i + 1] ?? 0) - low) * (at - i)
    }
  }
  if (type === 'para') {
    const kind = view.getUint16(offset + 8)
    const length = [1, 3, 4, 5, 7][kind]
    if (length === undefined || 12 + length * 4 > size) return undefined
    const p = Array.from({ length }, (_, i) => view.getInt32(offset + 12 + i * 4) / 65536)
    const [gamma = 1, a = 1, b = 0, c = 0, d = 0, e = 0, f = 0] = p
    // ICC.1 parametricCurveType: five variants of the sRGB-style piecewise power function.
    const power = (x: number) => Math.max(a * x + b, 0) ** gamma
    const curve: Curve =
      kind === 0
        ? (x) => Math.max(x, 0) ** gamma
        : kind === 1
          ? (x) => (x >= -b / a ? power(x) : 0)
          : kind === 2
            ? (x) => (x >= -b / a ? power(x) + c : c)
            : kind === 3
              ? (x) => (x >= d ? power(x) : c * x)
              : (x) => (x >= d ? power(x) + e : c * x + f)
    return (x) => Math.min(Math.max(curve(x), 0), 1)
  }
  return undefined
}

/**
 * Whether sampled values behave as a tone curve: finite, starting at black, rising (within the
 * rounding of 16-bit tables) and ending above black. Anything else is a damaged or hostile
 * profile, and converting with it would paint the picture wrongly.
 */
function isToneCurve(table: Float32Array): boolean {
  let previous = 0
  for (const v of table) {
    if (!Number.isFinite(v) || v < previous - 0.002) return false
    previous = Math.max(previous, v)
  }
  return (table[0] ?? 1) <= 0.01 && previous > 0.5
}

/** Whether RGB white (1, 1, 1) lands on the D50 white of the connection space, within 3%. */
function mapsWhiteToWhite(toXyz: number[], lut: Float32Array[]): boolean {
  const white = lut.map((table) => table[255] ?? 0)
  return D50_WHITE.every((expected, row) => {
    const sum =
      (toXyz[row * 3] ?? 0) * (white[0] ?? 0) +
      (toXyz[row * 3 + 1] ?? 0) * (white[1] ?? 0) +
      (toXyz[row * 3 + 2] ?? 0) * (white[2] ?? 0)
    return Math.abs(sum - expected) <= 0.03 * expected
  })
}

/**
 * Converts `pixels` (non-premultiplied RGBA, in place) from the ICC `profile` to sRGB, clipping
 * colours outside the sRGB gamut (as browsers do by default). Alpha is untouched.
 *
 * Nothing is written until the whole profile has been checked, so the pixels are either
 * converted completely or not touched at all. A profile is refused when its header, tag table,
 * colorants or curves are inconsistent (see `parseMatrixProfile` and `isToneCurve`), when it
 * does not map RGB white to the D50 white, or when it uses a lookup table. It never throws.
 *
 * @returns whether the pixels were converted: false for an unusable profile, and for one that
 * already is sRGB, where there is nothing to do and no reason to touch the pixels.
 */
export function convertToSrgb(pixels: Uint8ClampedArray, profile: Uint8Array): boolean {
  const parsed = parseMatrixProfile(profile)
  if (!parsed) return false
  const { toXyz, curves } = parsed

  // Combined linear transform: profile RGB -> XYZ (D50) -> linear sRGB.
  const m = XYZ_D50_TO_LINEAR_SRGB.map((_, k) => {
    const row = Math.floor(k / 3)
    const col = k % 3
    let sum = 0
    for (let j = 0; j < 3; j += 1) {
      sum += (XYZ_D50_TO_LINEAR_SRGB[row * 3 + j] ?? 0) * (toXyz[j * 3 + col] ?? 0)
    }
    return sum
  })
  // Per-channel lookup from the 8-bit encoded value to linear light.
  const lut = curves.map((curve) => Float32Array.from({ length: 256 }, (_, i) => curve(i / 255)))
  if (!lut.every(isToneCurve) || !m.every(Number.isFinite) || !mapsWhiteToWhite(toXyz, lut)) {
    return false
  }

  const identityMatrix = m.every((v, k) => Math.abs(v - (k % 4 === 0 ? 1 : 0)) < 0.002)
  const srgbCurves = lut.every((table) =>
    table.every((v, i) => Math.abs(255 * srgbEncode(v) - i) < 1),
  )
  if (identityMatrix && srgbCurves) return false

  const [lr = new Float32Array(256), lg = new Float32Array(256), lb = new Float32Array(256)] = lut
  const [m0 = 1, m1 = 0, m2 = 0, m3 = 0, m4 = 1, m5 = 0, m6 = 0, m7 = 0, m8 = 1] = m
  const encode = srgbEncodeTable()
  const top = ENCODE_STEPS - 1
  const quantize = (v: number) => encode[v <= 0 ? 0 : v >= 1 ? top : (v * top + 0.5) | 0] ?? 0
  for (let i = 0; i < pixels.length; i += 4) {
    const r = lr[pixels[i] ?? 0] ?? 0
    const g = lg[pixels[i + 1] ?? 0] ?? 0
    const b = lb[pixels[i + 2] ?? 0] ?? 0
    pixels[i] = quantize(m0 * r + m1 * g + m2 * b)
    pixels[i + 1] = quantize(m3 * r + m4 * g + m5 * b)
    pixels[i + 2] = quantize(m6 * r + m7 * g + m8 * b)
  }
  return true
}
