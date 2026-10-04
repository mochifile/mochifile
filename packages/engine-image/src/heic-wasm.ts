/**
 * HEIC decoding in WebAssembly: libheif + libde265 from `libheif-js` (LGPL-3.0, ADR 0022), used
 * only where the browser cannot decode HEIC itself. Imported dynamically, so engines that never
 * need it (and every Safari session) never load it.
 *
 * `libheif.wasm` ships as its own unmodified, same-origin file, as the LGPL asks: the bundler
 * emits it as a hashed asset and `locateFile` points the Emscripten loader at it.
 */
import { ToolError } from '@mochifile/tool-kit'
import libheifFactory from 'libheif-js/libheif-wasm/libheif.js'

/** The parts of the libheif Emscripten module used here. */
interface LibHeif {
  heif_context_alloc(): unknown
  heif_context_free(context: unknown): void
  heif_context_read_from_memory(context: unknown, bytes: Uint8Array): { code: { value: number } }
  heif_js_context_get_primary_image_handle(context: unknown): unknown
  heif_image_handle_release(handle: unknown): void
  heif_image_handle_is_premultiplied_alpha(handle: unknown): number
  heif_js_decode_image2(
    handle: unknown,
    colorspace: unknown,
    chroma: unknown,
  ): Promise<{
    code?: unknown
    image: unknown
    width: number
    height: number
    channels: Array<{ width: number; height: number; stride: number; data: Uint8Array }>
  }>
  heif_image_release(image: unknown): void
  heif_error_code: { heif_error_Ok: { value: number } }
  heif_colorspace: { heif_colorspace_RGB: unknown }
  heif_chroma: { heif_chroma_interleaved_RGBA: unknown }
}

type Factory = (options: {
  locateFile?: (path: string) => string
  wasmBinary?: Uint8Array
}) => Promise<LibHeif>

export type HeicDecode = (bytes: Uint8Array) => Promise<ImageData>

const invalid = (why: string) => new ToolError('invalid-file', `Not a valid HEIC image: ${why}`)

/**
 * Loads libheif and returns a decoder. Pass the `.wasm` bytes where they cannot be fetched, as
 * in Node tests. (libheif-js's setup code expects Emscripten's own loading: an
 * `instantiateWasm` hook with a precompiled module breaks its bindings.)
 */
export async function loadHeicDecoder(wasmBinary?: Uint8Array): Promise<HeicDecode> {
  const lib = await (libheifFactory as unknown as Factory)(
    wasmBinary
      ? { wasmBinary }
      : await import('./heic-wasm-url.ts').then(({ default: url }) => ({ locateFile: () => url })),
  )

  return async (bytes) => {
    const context = lib.heif_context_alloc()
    let handle: unknown
    let decoded: Awaited<ReturnType<LibHeif['heif_js_decode_image2']>> | undefined
    try {
      const read = lib.heif_context_read_from_memory(context, bytes)
      if (read.code.value !== lib.heif_error_code.heif_error_Ok.value) throw invalid('unreadable')
      handle = lib.heif_js_context_get_primary_image_handle(context)
      if (!handle) throw invalid('no primary image')
      // Decoding applies the file's transformations (rotation, mirroring, crop) and assembles
      // grid images (iPhone photos are 512 px tiles) into one picture.
      decoded = await lib.heif_js_decode_image2(
        handle,
        lib.heif_colorspace.heif_colorspace_RGB,
        lib.heif_chroma.heif_chroma_interleaved_RGBA,
      )
      const channel = decoded.channels?.[0]
      if (decoded.code || !channel) throw invalid('decoding failed')
      const { width, height, stride, data } = channel
      const pixels = new Uint8ClampedArray(width * height * 4)
      if (stride === width * 4) pixels.set(data.subarray(0, pixels.length))
      else {
        for (let y = 0; y < height; y += 1) {
          pixels.set(data.subarray(y * stride, y * stride + width * 4), y * width * 4)
        }
      }
      if (lib.heif_image_handle_is_premultiplied_alpha(handle)) unpremultiply(pixels)
      return new ImageData(pixels, width, height)
    } finally {
      // Free the WebAssembly memory now: a 12 MP photo holds about 50 MB.
      if (decoded?.image) lib.heif_image_release(decoded.image)
      if (handle) lib.heif_image_handle_release(handle)
      lib.heif_context_free(context)
    }
  }
}

/** ImageData is non-premultiplied; undo premultiplied alpha in place. */
function unpremultiply(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 255
    if (alpha === 0 || alpha === 255) continue
    data[i] = ((data[i] ?? 0) * 255) / alpha
    data[i + 1] = ((data[i + 1] ?? 0) * 255) / alpha
    data[i + 2] = ((data[i + 2] ?? 0) * 255) / alpha
  }
}
