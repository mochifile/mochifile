# 0016. Image engine: jSquash codecs with native decoding

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

The first image tools (starting with "Compress image to target size") must run entirely in the
browser ([ADR 0006](0006-client-side-processing-first.md)), in Web Workers, under a CSP that
allows only same-origin scripts plus `'wasm-unsafe-eval'` ([ADR 0012](0012-content-security-policy.md)),
without cross-origin isolation ([ADR 0011](0011-cross-origin-isolation-per-route.md)). They must
produce the same results in Chromium, Firefox and WebKit, and work on mid-range phones with
photos up to 48 MP. Browsers' own encoders (`OffscreenCanvas.convertToBlob`) differ between
engines in size and quality, and Safari cannot encode WebP at all.

A spike (October 2026; Chromium 153 and WebKit 26.6 measured locally, Firefox to be covered by
CI end-to-end tests) found:

| Check | Chromium | WebKit |
| --- | --- | --- |
| `createImageBitmap(…, { imageOrientation: 'from-image' })` applies EXIF orientation in a worker | yes | yes |
| Resize options combined with orientation (size is the displayed size) | yes | yes |
| jSquash JPEG decoder with `preserveOrientation` | yes | yes |
| Canvas readback exact (normal browsing) | yes | yes |
| jSquash glue and `.wasm` under our CSP, built by Vite | no violations | no violations |
| Peak memory, 48 MP JPEG decoded to 16 MP via `createImageBitmap` | ~404 MB (no saving over full size, ~394 MB) | ~327 MB (vs ~511 MB full size) |
| Peak memory, `ImageDecoder` with `desiredWidth` | ~262 MB (decodes at a reduced DCT scale) | ~1.6 GB (ignores the size) |
| Peak memory, jSquash full-size decode of 48 MP | ~471 MB | ~510 MB |
| One mozjpeg encode of 12–16 MP (desktop) | ~0.65–1 s | ~1 s |

Safari applies anti-fingerprinting noise to canvas readback in private browsing (and, since
Safari 26, to known fingerprinting scripts everywhere); Brave and Firefox with
`resistFingerprinting` do similar things. Noise in the readback would silently alter users'
photos.

## Decision

New package `@mochifile/engine-image` (source-only), used from tool workers:

- **Encoders: jSquash** (Apache-2.0), single-threaded builds: mozjpeg for JPEG, libwebp for
  WebP, oxipng for lossless PNG, and `@jsquash/resize` (Lanczos3, gamma-correct, alpha-aware)
  for every downscale. Same output in every browser. The `.wasm` files are emitted by Vite as
  hashed same-origin assets: self-hosted, cached immutably, allowed by the CSP as is.
- **Decoding: native first, chosen per session by probes** (`chooseDecodePath()`):
  1. If a canvas readback of an embedded 4×4 PNG is not exact (anti-fingerprinting), use the
     **jSquash decoders** (mozjpeg, libwebp, PNG) at full size, limited to **24 MP**.
  2. Otherwise, for JPEG, use **`ImageDecoder`** when a probe proves it decodes at a reduced
     size and applies orientation (Chromium today): the engine asks for the smallest DCT
     scale (n/8) that still covers the target size, then resizes exactly.
  3. Otherwise **`createImageBitmap`** with `imageOrientation: 'from-image'` and resize options.
  Every path returns upright, non-premultiplied pixels at most at the target size.
- **Memory limits:** inputs over **100 MP** are rejected before decoding; processing happens at
  most at **16 MP**; one file at a time per worker; canvases and bitmaps are freed right away.
- **Metadata:** results are re-encoded from pixels, so they carry no EXIF, GPS, XMP or text.
  When a file is already under the target, a lossless stripper removes metadata without
  re-encoding (JPEG keeps JFIF, ICC and Adobe segments and gets an orientation-only EXIF if
  needed; PNG drops text and time chunks; WebP drops EXIF/XMP and fixes VP8X flags) and drops
  data appended after the image (e.g. motion-photo video).
- **Preloading:** `createBrowserEngine()` runs the probes and loads every codec the session
  can need. Tools call it from their `prepare` hook, which the UI triggers on the first sign
  of intent (pointer, focus, touch or drag on the tool), so no request happens after a file is
  chosen. It also runs when the page is idle, **except** when `navigator.connection.saveData`
  is true or `effectiveType` is `2g`/`slow-2g` (`shouldPreloadOnIdle()`); browsers without the
  Network Information API (Safari, Firefox) preload on idle. Intent always triggers it.

### Licenses

All bundled code is compatible with AGPL-3.0 and is permissive; binary redistribution requires
reproducing the notices, which the site will publish with the first tool that ships them.

| Component | Package | License |
| --- | --- | --- |
| jSquash wrappers | `@jsquash/*` | Apache-2.0 |
| mozjpeg (libjpeg-turbo) | `@jsquash/jpeg` | IJG, BSD-3-Clause, zlib |
| libwebp | `@jsquash/webp` | BSD-3-Clause |
| Squoosh PNG codec (Rust) | `@jsquash/png` | Apache-2.0 per its README; ships a BSD-3-Clause (Google) license file |
| oxipng | `@jsquash/oxipng` | MIT |
| resize (Rust), magic-kernel | `@jsquash/resize` | MIT; hqx: Apache-2.0 |
| wasm-feature-detect | (dependency) | Apache-2.0 |

## Consequences

- Identical, high-quality results in every browser, testable in Node with the very same
  WebAssembly (unit tests load the `.wasm` files from disk).
- ~300 KB of compressed WebAssembly per session (mozjpeg encoder 59 KB, WebP encoder 126 KB,
  oxipng 76 KB, resize 17 KB, plus the decoders on the fallback path), loaded only on tool
  pages and only after intent or idle.
- In private browsing in Safari, photos above 24 MP are refused with a friendly message.
- Speed is bounded by WebAssembly encoders: a few hundred ms per encode on desktop, several
  times that on phones; the size search keeps the number of encodes low (ADR 0017).
- jSquash is maintained but slow-moving. If its glue ever conflicts with the CSP or the
  bundler, patch it with `pnpm patch` rather than loosen the CSP.
- Firefox's behaviour (orientation, canary, `ImageDecoder` scaling) is not assumed: the probes
  decide at run time, and end-to-end tests run in Firefox in CI.
