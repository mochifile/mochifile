# 0017. Size-targeting algorithm

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

"Compress image to target size" promises a result **at or below** a size such as 50 KB,
usually to pass an upload limit on a government or job form. People want the best-looking
result that still passes. Encoders cannot be asked for a size directly; only quality and
dimensions can be chosen, and each encode costs from tens of milliseconds (small images,
desktop) to seconds (12–16 MP, phones). The algorithm must be correct first, close to the
target second, and use few encodes third.

## Decision

Implemented in `packages/engine-image/src/compress.ts` (pipeline) and `fit-to-size.ts`
(search). `fitToSize()` is pure and codec-agnostic (`encode(quality, scale)` is injected), so
it is unit-tested exhaustively with a fake codec as well as with the real ones.

**Units.** 1 KB = 1,000 bytes and 1 MB = 1,000,000 bytes. A "50 KB" result is at most 50,000
bytes, so it also passes portals that count 1 KB as 1,024 bytes.

**Pipeline**

1. Read the header (format, size, EXIF orientation) without decoding. Reject files over
   100 MP.
2. **Already under the target, same format requested:** return the original pixels with the
   metadata stripped losslessly ([ADR 0016](0016-image-engine-jsquash-with-native-decoding.md)).
   With a different explicit output format, convert instead.
3. **Output format:** `original` keeps JPEG as JPEG and WebP as WebP. PNG is first optimised
   losslessly (oxipng) at working size and kept if it fits; otherwise it becomes JPEG. `jpeg`
   and `webp` force that format. Whenever the output is JPEG, transparent pixels are
   composited onto white and the result says so (`flattenedTransparency`); WebP keeps
   transparency.
4. **Start scale:** the smaller of 1, the memory cap (16 MP), and
   `√(target·8 / (0.05 bpp · pixels))`. 0.05 bits per pixel is far below what any photo needs
   at minimum quality, so this only skips sizes certain to be too big.
5. **Search** (below), then a final check that the result is at most the target. A result
   above the target is impossible by construction; if it ever happened, the run fails rather
   than returning it.

**Search, per scale**

- Quality range 40–90. Below 40, JPEG and WebP artifacts get more distracting than a smaller
  image; above 90, files grow fast for no visible gain.
- Encode at quality 90: if it fits, done. Otherwise encode at 40. If 40 does not fit either,
  **shrink** (never upscale): file size grows with pixel count to the power 0.75 (measured
  0.70–0.83; smaller copies pack more detail per pixel), so each side shrinks by
  `(0.92·target / size₄₀)^(1/1.5)`, clamped to 0.5–0.9 per step, never below 64 px on the long
  side.
- Otherwise search the quality between the two by interpolating on log(size), falling back to
  bisection when the same end moves twice in a row. Stop when the quality interval closes,
  after 7 measured encodes at this scale, or once a fitting result uses 97% of the target
  (closer is not visible).
- After a shrink, both ends are **predicted** from the previous scale with the 0.75 model
  instead of re-encoded; only measured encodings are ever returned, and an unconfirmed
  prediction is measured before giving up on a scale.
- At the 64 px floor, if quality 40 still does not fit: `target-unreachable`, with the
  smallest size reached (`details.smallestBytes`) so the UI can say so.

**Measured** (real mozjpeg, the three fixture photos, targets 20/50/100/200 KB): 3–7 encodes
per photo, 65 in total for 11 compressions (one was already under its target); results use
97.5–99.6% of the target, except where mozjpeg's size jumps between two quality steps (84% and
92.5% in two cases). Full size is kept whenever quality 40 fits.

## Consequences

- The size guarantee holds for every input, including size curves that are not monotonic
  (tested).
- Dimensions are reduced only when the minimum acceptable quality is still too big; when they
  are, the result says so, with the new size.
- A few encodes per photo: fast on desktop, a few seconds for large photos on phones, with
  per-encode progress and cancellation between encodes.
- The constants (quality range, 0.75 exponent, margins, 97%) live in `fit-to-size.ts` and can
  be tuned with the same tests if real usage shows a better trade-off.
