/**
 * WebAssembly codecs from jSquash (ADR 0016), behind one small interface.
 *
 * In the browser each codec fetches its own `.wasm` file, which the bundler emits as a hashed,
 * same-origin asset (the CSP allows only 'self' + 'wasm-unsafe-eval'). Tests in Node pass
 * precompiled modules instead. Only single-threaded builds are used: multi-threading needs
 * cross-origin isolation, which the site does not enable globally (ADR 0011).
 */
import decodeJpegWasm, { init as initJpegDecode } from '@jsquash/jpeg/decode.js'
import encodeJpegWasm, { init as initJpegEncode } from '@jsquash/jpeg/encode.js'
import optimisePng, { init as initOxipng } from '@jsquash/oxipng/optimise.js'
import decodePngWasm, { init as initPngDecode } from '@jsquash/png/decode.js'
import resizeWasm, { initResize } from '@jsquash/resize'
import decodeWebpWasm, { init as initWebpDecode } from '@jsquash/webp/decode.js'
import encodeWebpWasm, { init as initWebpEncode } from '@jsquash/webp/encode.js'
import type { HeicDecode } from './heic-wasm.ts'
import type { ImageFormat } from './sniff.ts'

/** Precompiled modules, for environments that cannot fetch `.wasm` files (Node tests). */
export interface WasmModules {
  jpegEncode: WebAssembly.Module
  jpegDecode: WebAssembly.Module
  /** The SIMD build, which jSquash picks when the runtime supports it. */
  webpEncode: WebAssembly.Module
  webpDecode: WebAssembly.Module
  pngDecode: WebAssembly.Module
  oxipng: WebAssembly.Module
  resize: WebAssembly.Module
  /** libheif's `.wasm` bytes (HEIC), only needed when `heic` is requested. */
  heicDecode?: Uint8Array
  /** libavif decoder, only needed when `avif` is requested. */
  avifDecode?: WebAssembly.Module
}

export interface Codecs {
  encodeJpeg(image: ImageData, quality: number): Promise<Uint8Array>
  encodeWebp(image: ImageData, quality: number): Promise<Uint8Array>
  /** Lossless, optimised PNG. */
  encodePng(image: ImageData): Promise<Uint8Array>
  /** High-quality downscale (Lanczos3, gamma-correct, alpha-aware). */
  resize(image: ImageData, width: number, height: number): Promise<ImageData>
  /**
   * Full-size WebAssembly decode. JPEG orientation and HEIC transformations are applied; AVIF
   * comes as stored (see `applyOrientation`). HEIC and AVIF need their decoder loaded.
   */
  decode(format: ImageFormat, bytes: Uint8Array): Promise<ImageData>
}

// The Emscripten-based `init` functions accept a module first at runtime, but their type
// declarations only list the options argument.
type EmscriptenInit = (module?: WebAssembly.Module) => Promise<unknown>

/** A standalone ArrayBuffer for the codecs, which do not accept views or shared buffers. */
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer instanceof ArrayBuffer &&
  bytes.byteOffset === 0 &&
  bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.slice().buffer

/**
 * Loads the codecs. Encoders and the resizer always load; the JPEG, PNG and WebP decoders only
 * when `decoders` is true (the WebAssembly decode path, ADR 0016); the HEIC and AVIF decoders
 * only when asked for, where the browser cannot decode those formats (ADR 0022). Resolves once
 * every `.wasm` is ready, so no request happens later.
 */
export async function loadCodecs({
  decoders,
  heic = false,
  avif = false,
  modules,
}: {
  decoders: boolean
  heic?: boolean
  avif?: boolean
  modules?: WasmModules
}): Promise<Codecs> {
  // Imported on demand, so engines that never decode HEIC or AVIF never load their code.
  const [heicDecode, avifDecode] = await Promise.all([
    heic
      ? import('./heic-wasm.ts').then(({ loadHeicDecoder }) => loadHeicDecoder(modules?.heicDecode))
      : undefined,
    avif ? loadAvifDecoder(modules?.avifDecode) : undefined,
  ])
  await Promise.all([
    (initJpegEncode as EmscriptenInit)(modules?.jpegEncode),
    (initWebpEncode as EmscriptenInit)(modules?.webpEncode),
    initOxipng(modules?.oxipng),
    initResize(modules?.resize),
    ...(decoders
      ? [
          (initJpegDecode as EmscriptenInit)(modules?.jpegDecode),
          (initWebpDecode as EmscriptenInit)(modules?.webpDecode),
          initPngDecode(modules?.pngDecode),
        ]
      : []),
  ])

  return {
    async encodeJpeg(image, quality) {
      return new Uint8Array(await encodeJpegWasm(image, { quality }))
    },
    async encodeWebp(image, quality) {
      return new Uint8Array(await encodeWebpWasm(image, { quality }))
    },
    async encodePng(image) {
      return new Uint8Array(await optimisePng(image, { level: 2, interlace: false }))
    },
    resize(image, width, height) {
      return resizeWasm(image, {
        width,
        height,
        method: 'lanczos3',
        fitMethod: 'stretch',
        premultiply: true,
        linearRGB: true,
      })
    },
    decode(format, bytes) {
      const buffer = toArrayBuffer(bytes)
      if (format === 'jpeg') return decodeJpegWasm(buffer, { preserveOrientation: true })
      if (format === 'webp') return decodeWebpWasm(buffer)
      if (format === 'png') return decodePngWasm(buffer)
      const decoder = format === 'heic' ? heicDecode : avifDecode
      if (!decoder) throw new Error(`The ${format} decoder was not loaded`)
      return decoder(bytes)
    },
  }
}

/** The jSquash AVIF decoder (libavif), loaded on demand. */
async function loadAvifDecoder(module?: WebAssembly.Module): Promise<HeicDecode> {
  const { default: decode, init } = await import('@jsquash/avif/decode.js')
  await (init as EmscriptenInit)(module)
  return async (bytes) => {
    const image = await decode(toArrayBuffer(bytes))
    if (!image) throw new Error('AVIF decoding failed')
    return image
  }
}
