# 0022. HEIC and AVIF decoding: native first, WebAssembly fallback

- **Status:** Accepted, on the condition below (legal advice before any monetisation)
- **Date:** 2026-10-04

## Context

The second tool, "Convert image", must read HEIC/HEIF photos, the default format of iPhone
cameras, and AVIF, alongside the JPG, PNG and WebP that the image engine
([ADR 0016](0016-image-engine-jsquash-with-native-decoding.md)) already decodes. "heic to jpg"
is the tool's main search target: most people searching it hold iPhone photos on a Windows PC
or an Android phone. Everything runs in the browser
([ADR 0006](0006-client-side-processing-first.md)), under a strict CSP with no
`'unsafe-eval'` ([ADR 0012](0012-content-security-policy.md)), with dependencies pinned from
npm.

Research (October 2026; sources below):

- **Native HEIC support exists only in Safari 17+** (macOS, iOS), which decodes through the
  operating system. Chrome, Edge, Firefox and Android browsers do not, and the reason given
  is HEVC patent licensing. `ImageDecoder.isTypeSupported` and user-agent sniffing are
  unreliable for detection (Safari before 17 claimed support it lacked). The dependable test is
  to decode a tiny sample with `createImageBitmap` where the decoding will happen.
- **Native AVIF support** covers about 95% of browsers (Chrome 85+, Firefox 93+, Safari 16.4+).
- **WebAssembly HEIC decoders on npm:**

  | Package | Verdict |
  | --- | --- |
  | **libheif-js 1.23.2** (2026-09-05, LGPL-3.0): libheif + libde265 1.0.15, Emscripten | **Chosen.** Real WebAssembly in a separate same-origin `libheif.wasm` (1.42 MB, 469 KB gzipped), no `eval`/`new Function`, decodes iPhone grid images, applies rotation/mirror, handles alpha. One maintainer, tracks libheif releases. |
  | heic-to | Rejected: asm.js (no WebAssembly), starts workers from `blob:` URLs, uses `new Function`. |
  | heic2any | Rejected: unmaintained since 2023, uses `new Function`, needs the DOM. |
  | wasm-vips | Rejected for HEIC: built without libde265 (AVIF only); uses `eval`, needs cross-origin isolation. |
  | elheif, @saschazar/wasm-heif, libheif-wasm | Rejected: inactive or stale. |

- **AVIF fallback:** `@jsquash/avif` 2.1.1 (Apache-2.0), decoder as a separate `.wasm`
  (about 1.2 MB), CSP-clean, from the same family as our other codecs.

## Decision

1. **Native first.** In the worker, `prepare` decodes tiny embedded synthetic HEIC and AVIF
   samples with `createImageBitmap(blob, { imageOrientation: 'from-image' })`. Where that
   works, files decode natively and no fallback is downloaded.
2. **WebAssembly fallback.** Where a native probe fails, `prepare` loads `libheif-js` (HEIC) or
   `@jsquash/avif` (AVIF) from our own origin, on the first sign of intent or when idle, as for
   the other codecs (never on Save-Data or 2G idle). Nothing is fetched after a file is chosen,
   which keeps the privacy rule that no request follows selection. Safari users never
   download the HEVC decoder.
3. **LGPL-3.0 compliance** (libheif and libde265; compatible with our AGPL-3.0, which may
   include LGPL-3.0 code):
   - `libheif.wasm` and its JavaScript glue ship as separate, unmodified, replaceable files;
   - the third-party notices (`/third-party-licenses.txt`) list libheif and libde265 with their
     licence texts and copyright notices and link the exact upstream sources: libheif-js 1.23.2,
     libheif 1.23, libde265 1.0.15;
   - the rest of Mochifile is AGPL-3.0 with reproducible builds, so its source is available too.
4. **Patents: the risk is accepted, documented, and revisited before money is involved.**

## Patent considerations (not legal advice)

- HEVC (H.265) is covered by patent pools:
  - Access Advance, which in December 2025 acquired the former MPEG LA/Via LA HEVC/VVC programme;
  - Velos Media, which publishes no terms;
  - individual holders outside the pools.
- In 2016 Access Advance (then HEVC Advance) said it would not seek royalties for HEVC
  decoding in application software downloaded to PCs or mobile devices and run on a
  general-purpose CPU, naming browsers as an example, "subject to certain conditions". A
  WebAssembly decoder in a web page plausibly fits this. **Unconfirmed:**
  - whether that statement still applies after the 2025–26 consolidation;
  - whether the other pools or holders take the same view;
  - how pools count "units" for still images.
- Many free projects ship libde265 (VLC, GStreamer, ImageMagick) with no known enforcement
  against free distribution. The risk is not zero, and it grows if Mochifile earns money in a
  jurisdiction that enforces software patents.
- AV1/AVIF is royalty-free under the AOMedia Patent License 1.0. A third-party AV1 pool
  (Sisvel) has asserted claims, and browsers ship AV1 regardless.
- Mitigation built in: Safari users decode natively through the operating system's licensed
  decoder; the WebAssembly decoder runs only where the browser cannot decode HEIC.

### Condition: one IP consultation before any monetisation

Before Mochifile earns money in any form (ads or Premium), not merely before launch, the
maintainer gets legal advice from an IP lawyer. **One consultation covers three topics:**

1. HEVC decoding: whether shipping libde265 in the WebAssembly fallback needs a licence, and
   whether the 2016 software statement still applies.
2. The "Mochi" trademark question ([ADR 0002](0002-product-name-and-brand-usage.md)):
   clearance and registration of "Mochifile", and the risk from other "Mochi" marks.
3. The privacy policy ([ADR 0009](0009-privacy-by-design.md)): review of the public policy
   before launch and before ads or accounts exist.

If the advice is against the WebAssembly HEVC decoder, the fallback is removed: Safari keeps
native HEIC, and other browsers get a clear message with instructions instead. That change
touches one engine module and this ADR.

## Consequences

- HEIC conversion works in every current browser. Users outside Safari download about 470 KB
  once (cached, immutable) when they first use the converter, never before intent.
- Two LGPL components are shipped; their notices and source links are part of the build's
  third-party notices and are checked by its tests.
- Safari's native path and the WebAssembly path are both tested end to end, with one real
  iPhone grid photo (4032 × 3024, 61 HEVC tiles, rotated) released under CC0 by the
  maintainer. Its EXIF block, which held GPS location, device and capture times, is blanked
  without re-encoding the image; the decoded pixels are unchanged.
- Monetisation is blocked on the consultation above. A Premium or ads PR must reference its
  outcome.

## Sources (checked October 2026)

- HEIF support: https://caniuse.com/heif and https://caniuse.com/avif
- Firefox HEIF bug (patents): https://bugzilla.mozilla.org/show_bug.cgi?id=1402293
- Detecting HEIC by decoding a sample: https://dev.to/iterandum/ask-the-browser-to-decode-heic-before-you-ship-a-510-kb-wasm-decoder-1ie6
- Safari before 17 claiming HEIC: https://github.com/immich-app/immich/pull/26122
- libheif-js: https://github.com/catdad-experiments/libheif-js; libheif: https://github.com/strukturag/libheif; libde265: https://github.com/strukturag/libde265
- Access Advance software statement (2016): https://www.prnewswire.com/news-releases/hevc-advance-announces-royalty-free-hevc-software-300367212.html
- Access Advance acquires the Via LA HEVC/VVC programme (2025): https://accessadvance.com/2025/12/15/access-advance-and-via-licensing-alliance-announce-hevc-vvc-program-acquisition/
- FSF on combining AGPLv3 with GPLv3-family licences: https://www.fsf.org/bulletin/2021/fall/the-fundamentals-of-the-agplv3
