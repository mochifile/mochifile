/**
 * Test-only: loads the real WebAssembly codecs in Node from `node_modules`, so unit tests run
 * the exact encoders and decoders the browser uses. Never imported by production code.
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { type Codecs, loadCodecs } from '../codecs.ts'

const require = createRequire(import.meta.url)

/** Node has no `ImageData`; jSquash only needs its shape. */
class NodeImageData {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
  readonly colorSpace = 'srgb'
  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth
      this.height = widthOrHeight
      this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4)
    } else {
      this.data = dataOrWidth
      this.width = widthOrHeight
      this.height = height ?? dataOrWidth.length / 4 / widthOrHeight
    }
  }
}

export function installImageData(): void {
  globalThis.ImageData ??= NodeImageData as unknown as typeof ImageData
}

const compile = async (path: string) => WebAssembly.compile(await readFile(require.resolve(path)))

let codecs: Promise<Codecs> | undefined

export function loadNodeCodecs(): Promise<Codecs> {
  installImageData()
  codecs ??= (async () =>
    loadCodecs({
      decoders: true,
      modules: {
        jpegEncode: await compile('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'),
        jpegDecode: await compile('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'),
        webpEncode: await compile('@jsquash/webp/codec/enc/webp_enc_simd.wasm'),
        webpDecode: await compile('@jsquash/webp/codec/dec/webp_dec.wasm'),
        pngDecode: await compile('@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
        oxipng: await compile('@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm'),
        resize: await compile('@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm'),
        heicDecode: new Uint8Array(
          await readFile(require.resolve('libheif-js/libheif-wasm/libheif.wasm')),
        ),
        avifDecode: await compile('@jsquash/avif/codec/dec/avif_dec.wasm'),
      },
      heic: true,
      avif: true,
    }))()
  return codecs
}
