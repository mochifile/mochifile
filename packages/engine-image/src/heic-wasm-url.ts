/// <reference path="./assets.d.ts" />
/**
 * URL of `libheif.wasm`, emitted by the bundler as an unmodified, hashed, same-origin file
 * (ADR 0022). Browser only: plain Node cannot resolve `?url`, so Node passes the bytes instead.
 */
import libheifWasmUrl from 'libheif-js/libheif-wasm/libheif.wasm?url'

export default libheifWasmUrl
