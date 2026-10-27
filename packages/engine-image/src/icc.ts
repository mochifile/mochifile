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

/** Reads the profile's tag table and its tone curves and colorants; undefined if unsupported. */
function parseMatrixProfile(icc: Uint8Array): MatrixProfile | undefined {
  if (icc.length < 132) return undefined
  const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength)
  const sig = (at: number) => String.fromCharCode(...icc.subarray(at, at + 4))
  // Header: 'acsp' file signature, RGB data colour space and an XYZ connection space.
  if (sig(36) !== 'acsp' || sig(16) !== 'RGB ' || sig(20) !== 'XYZ ') return undefined

  const count = view.getUint32(128)
  if (count > 256 || 132 + count * 12 > icc.length) return undefined
  const tags = new Map<string, { offset: number; size: number }>()
  for (let i = 0; i < count; i += 1) {
    const entry = 132 + i * 12
    const offset = view.getUint32(entry + 4)
    const size = view.getUint32(entry + 8)
    if (size >= 8 && offset <= icc.length && size <= icc.length - offset) {
      tags.set(sig(entry), { offset, size })
    }
  }
  // A lookup-table transform takes precedence over the matrix when both exist: not handled.
  if (tags.has('A2B0') || tags.has('A2B1')) return undefined

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
  // Colorants are columns: XYZ = [r g b] · linear RGB.
  const toXyz = [r[0], g[0], b[0], r[1], g[1], b[1], r[2], g[2], b[2]]
  if (toXyz.some((v) => v === undefined || !Number.isFinite(v))) return undefined
  return { toXyz: toXyz as number[], curves: [cr, cg, cb] }
}

/** A tone curve tag (`curv` or `para`) as a function from the encoded to the linear value. */
function parseCurve(
  view: DataView,
  sig: (at: number) => string,
  offset: number,
  size: number,
): Curve | undefined {
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
 * Converts `pixels` (non-premultiplied RGBA, in place) from the ICC `profile` to sRGB, clipping
 * colours outside the sRGB gamut (as browsers do by default). Alpha is untouched.
 *
 * @returns whether the pixels were converted: false for an unsupported profile, and for one
 * that already is sRGB, where there is nothing to do and no reason to touch the pixels.
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
