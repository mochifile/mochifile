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
   and messaging app assumes. Costs 43 ms and no extra memory for 12 MP.
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

Profiles it cannot use (lookup-table, gray, CMYK, damaged) and files described by `nclx` only
are left as they were before, never failing a conversion.

## Consequences

- HEIC output no longer depends on which decoder read it; a test compares the result with
  ColorSync references for Display P3 and Adobe RGB.
- Wide-gamut colours are not kept. If that is wanted later, option 2 can be built on top of
  this: the pixels are already sRGB, so a profile would be written as sRGB, not as the source.
- Not covered: the same gap exists for JPEG, PNG, WebP and AVIF read by the WebAssembly
  decoders (browsers with an inexact canvas readback), and for HEIC described by `nclx`
  primaries other than sRGB. Follow-up work.
