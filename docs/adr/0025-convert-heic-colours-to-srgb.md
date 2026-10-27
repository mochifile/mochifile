# 0025. Convert HEIC colours to sRGB when decoding with WebAssembly

- **Status:** Proposed
- **Date:** 2026-10-27

## Context

iPhone photos are tagged with the Display P3 colour profile (an ICC profile in the HEIC's `colr`
property). The browser decoders honour it: `createImageBitmap` converts to sRGB by default, so
Safari, which decodes HEIC natively, hands the engine sRGB pixels
([ADR 0022](0022-heic-and-avif-decoding.md)). The WebAssembly decoder (libheif) has no colour
management and returned the file's Display P3 numbers unchanged. Every output the engine
writes (JPG, PNG, WebP) is untagged, and viewers read an untagged image as sRGB, so a photo
converted through the WebAssembly path looked duller than the original.

Measured on the CC0 iPhone fixture against ColorSync (macOS), the colour difference of the
photo was ΔE 2.5 on average and up to 17 (up to 80 of 255 in a channel); on saturated colours
the effect is larger. See the pull request for the full evidence.

## Options considered

1. **Convert the pixels to sRGB while decoding (chosen).** What the native path already does,
   so every browser gives the same result. Untagged sRGB is what every viewer, social network
   and messaging app assumes. In place, so no extra memory; about 50–90 ms for 12 MP on an
   Apple M5 (see Verification; phones were not measured).
2. **Embed the source ICC profile in the output.** Keeps the wide gamut, but the encoders
   (mozjpeg, oxipng, libwebp) cannot write profiles, so JPEG `APP2`, PNG `iCCP` and WebP `ICCP`
   would be spliced in by hand; wide-gamut output is shown wrongly by software that ignores
   profiles; the resizer assumes sRGB; the files grow by the profile size. Copying the profile
   without converting is correct only when nothing else touches the pixels.
3. **Add a colour management library (lcms2 in WebAssembly).** Handles every profile type, but
   adds a new dependency and WebAssembly module (not measured here) for a case that matrix
   profiles already cover.

## Decision

We will convert the decoded pixels to sRGB right after libheif decodes them, with a small
in-house transform (`packages/engine-image/src/icc.ts`) for matrix/TRC ICC profiles: Display P3,
sRGB, Adobe RGB, ProPhoto. The profile comes from the file's own `colr` box (`heif.ts`).
Colours outside the sRGB gamut are clipped, as browsers do. Outputs stay untagged sRGB.

A profile is used only if it holds together: a declared size that fits the bytes, ICC version
2 to 4 and an image device class, no repeated tags, no lookup-table transform (`A2B*`/`D2B*`,
which would take precedence), colorants that are plausible and map RGB white to the D50 white,
and tone curves that are finite, start at black and do not fall. Anything else, gray and CMYK
profiles, and files described by `nclx` only are left as they were before, untouched and never
failing a conversion: the pixels are converted completely or not at all.

## Verification

- Same decoded pixels against ColorSync (macOS `sips`): the 12 MP iPhone fixture goes from a
  mean ΔE76 of 2.49 (p95 5.95, max 16.96) to 0.12 (p95 0.77, max 1.81), and at most 1 level of
  255 in any channel. Adobe RGB (a gamma curve) is checked against ColorSync in the unit tests.
- Safari's engine (WebKit 26.6) decodes HEIC natively and converts itself. On the Display P3
  chart, 14 of 16 patches are identical to the WebAssembly path with this change, the other two
  differ by 2 and 4 levels. That is most likely the two HEVC decoders (Apple's and libheif)
  rounding chroma differently, since on identical pixels the transform matches ColorSync to
  within 1 level; this was not isolated further. Out-of-gamut colours are clipped the same way.
- The production decoder (libheif plus this transform) was run in Chromium 153 and WebKit 26.6:
  its output is identical to Node's on 8,120 sampled pixels of the iPhone photo and on the
  charts. Chromium cannot decode HEIC itself. Firefox could not be started in the development
  sandbox and was not run.
- Cost on a 12 MP photo, on an Apple M5: the conversion takes about 90 ms in Node
  (50 ms on a first run), 56–58 ms in Chromium and 52–81 ms in WebKit, against 570–610 ms for
  the whole decode. A shared CI runner took more than 2 s for the same loop while other test
  processes ran, so the tests check the result, not the time. Phones were not measured. The
  tables use about 20 KB; the pixels are changed in place.

## Consequences

- HEIC output no longer depends on which decoder read it; a test compares the result with
  ColorSync references for Display P3 and Adobe RGB.
- Wide-gamut colours are not kept. If that is wanted later, option 2 can be built on top of
  this: the pixels are already sRGB, so a profile would be written as sRGB, not as the source.
- Not covered: the same gap exists for JPEG, PNG, WebP and AVIF read by the WebAssembly
  decoders (browsers with an inexact canvas readback), and for HEIC described by `nclx`
  primaries other than sRGB. Follow-up work.
