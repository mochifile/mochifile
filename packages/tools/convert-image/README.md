# Convert image

Converts HEIC, HEIF, AVIF, JPG, PNG and WebP photos to JPG, PNG or WebP at full resolution,
entirely in the browser. Pages: `/convert-image/`, six presets (`/heic-to-jpg/`,
`/webp-to-jpg/`, `/png-to-jpg/`, `/jpg-to-png/`, `/webp-to-png/`, `/jpg-to-webp/`) and their
Portuguese versions.

```
convert-image/
├── content/{en,pt}/*.md   page copy: index.md plus one file per preset
├── messages/{en,pt}.json  UI text
├── src/manifest.ts        id, limits, defaults, presets (variants) and SEO metadata
├── src/process.ts         calls the engine's `convertImage` for each file
├── src/worker.ts          creates the image engine once; `prepare` preloads it
└── src/Ui.tsx             format choice and dropzone on top of `@mochifile/tool-ui`
```

Quality is fixed by the engine (JPG q85, WebP q82, lossless PNG; ADR 0016) and HEIC/AVIF
decoding follows ADR 0022: native first, WebAssembly fallback. The UI calls `client.prepare()`
on the first sign of intent, so no request happens after a file is chosen; the e2e tests
(`apps/web/e2e/convert-image.spec.ts`) check that in every engine.
