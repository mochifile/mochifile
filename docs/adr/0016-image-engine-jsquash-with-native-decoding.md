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

## Updates

- **2026-10-03: real devices and decode speed.**
  - **Phones, production, camera photos, 50 KB target** (measured by the maintainer):

    | Device | Input | Result | Total time |
    | --- | --- | --- | --- |
    | iPhone 13, Safari | 3.5 MB, 3024 × 4032 (12 MP) | 48 KB, 981 × 1308 | about 1 s |
    | Xiaomi Poco X3, Chrome | 5.2 MB, 3880 × 5184 (20 MP) | 49 KB, 734 × 980 | about 4.5 s |

    iOS hands the full-size photo from the picker to the page (converted to JPEG); it does
    not shrink it. Downloads are instant on both.
  - **Desktop, per step** (Apple M2, Chromium 153 as a normal headed app, 12–42 MP photos):
    `ImageDecoder` took 1.8–1.9 s to decode at the working size, against 0.2–0.4 s for
    `createImageBitmap`, because of the extra exact resize and the frame readback.
    `ImageDecoder` is now used only above 24 MP (`IMAGE_DECODER_MIN_PIXELS`), where its lower
    memory use matters; smaller photos take the `bitmap` path. The WebAssembly path keeps its
    full-size decode for the next request on the same file, so a preview and the working
    image cost one decode.
  - Headless automated measurements overstated times by about 30%; speed figures in this
    project come from normal browser windows in the foreground (Safari slows background
    windows heavily).
- **2026-10-03: real devices after the faster size search** (PR #12; ADR 0017 update).
  Production, camera photos, 50 KB target, measured by the maintainer:

  | Device | Before PR #12 | After PR #12 |
  | --- | --- | --- |
  | iPhone 13, Safari | about 1 s | under 1 s |
  | Motorola Moto G, Chrome | not measured | about 2 s |

  The Android result is from a different phone than the earlier Poco X3 test (about 4.5 s
  for a 20 MP photo before the change), so the two are not a direct before/after comparison.
  The photo size used on the Moto G was not recorded. A same-device Android before/after
  would need the Poco X3 again or a build from before PR #12.
- **2026-10-04: HEIC and AVIF input, and conversion** ([ADR 0022](0022-heic-and-avif-decoding.md)).
  - **Reading.** The engine also reads HEIC and AVIF. `sniffImage` reads their size, rotation
    (`irot`) and alpha from the file's `meta` box without decoding. Engines that need these
    formats ask for them (`createBrowserEngine({ extraFormats })`); compress-image does not, so
    nothing changes for it.
  - **Decoders.** Each extra format is probed in the worker by decoding a 64 × 64 sample with
    `createImageBitmap`. Where that works (and the canvas readback is exact), the browser
    decodes it. Elsewhere the format's WebAssembly decoder is loaded during `prepare`:
    - HEIC: libheif + libde265 (`libheif-js`, 1.42 MB, about 470 KB gzipped). It applies the
      file's rotation and mirroring and assembles iPhone grid images. It decodes a 12 MP
      iPhone photo in about 0.8 s in Node on an M2.
    - AVIF: libavif + libaom (`@jsquash/avif`, 1.2 MB). Rotation is applied afterwards.

    Both are imported dynamically, so engines that never need them never load their code.
    Samples smaller than 64 × 64 don't work: macOS pads a tiny HEIC's coded frame, and
    libheif's security limit then rejects it.
  - **Converting.** `convertImage` converts at full resolution, without the 16 MP working limit
    (the 100 MP input limit stays).
    - JPG is written by mozjpeg at quality 85 and WebP by libwebp at 82; PNG is lossless.
    - A file already in the wanted format is not re-encoded: only its metadata is removed.
    - Transparency is filled with white for JPG, and the result says so.
    - WebAssembly decoding keeps its 24 MP limit, so on browsers without native HEIC a 48 MP
      iPhone "HEIF Max" photo is refused with a clear error. Native decoding (Safari) has no
      such limit.
    - Phone memory and speed are measured in the convert-image PR and recorded here.
  - **Licences.** The notices add libheif 1.23.2 and libde265 1.0.15 (LGPL-3.0, with exact
    source links) and libavif 1.0.1 and libaom 3.7.0 (BSD-2-Clause and the AOMedia Patent
    License). The texts these packages don't ship are kept in `apps/web/integrations/notices/`.
