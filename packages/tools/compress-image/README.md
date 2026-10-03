# Compress image to target size

Shrinks JPG, PNG and WebP photos to at most a chosen size (20 KB … 1 MB presets, or any size
from 5 KB to 20 MB), entirely in the browser. Pages: `/compress-image/`, one per preset
(`/compress-image-to-50kb/` …) and their Portuguese versions.

```
compress-image/
├── content/{en,pt}/*.md   page copy: index.md plus one file per preset
├── messages/{en,pt}.json  UI text
├── src/manifest.ts        id, limits, defaults, presets (variants) and SEO metadata
├── src/sizes.ts           presets, KB/MB formatting and parsing (1 KB = 1,000 bytes)
├── src/process.ts         calls the engine for each file; output names like photo-50kb.jpg
├── src/worker.ts          creates the image engine once; `prepare` preloads it
└── src/Ui.tsx             size and format choices, queue, downloads, ZIP
```

The work is done by [`@mochifile/engine-image`](../../engine-image) (ADR 0016, ADR 0017).
The UI calls `client.prepare()` on the first sign of intent, or when the page is idle unless
the visitor saves data or is on 2G, so no request happens after a file is chosen; the e2e
tests (`apps/web/e2e/compress-image.spec.ts`) check that in every engine.
