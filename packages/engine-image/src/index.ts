export type { Codecs, WasmModules } from './codecs.ts'
export { loadCodecs } from './codecs.ts'
export {
  type CompressContext,
  type CompressMeta,
  type CompressOptions,
  type CompressOutcome,
  type CompressResult,
  compressToTarget,
  type ImageEngine,
  MAX_INPUT_PIXELS,
  MAX_WORKING_PIXELS,
  type OutputFormat,
} from './compress.ts'
export { type DecodePath, WASM_MAX_PIXELS } from './decode.ts'
export {
  DEFAULT_QUALITY,
  estimateStartScale,
  type FitToSizeOptions,
  type FitToSizeResult,
  fitToSize,
  MIN_LONG_SIDE,
} from './fit-to-size.ts'
export {
  type BrowserEngine,
  createBrowserEngine,
  type NavigatorLike,
  shouldPreloadOnIdle,
} from './prepare.ts'
export { displaySize, type ImageFormat, type ImageInfo, sniffImage } from './sniff.ts'
export { stripMetadata } from './strip-metadata.ts'
