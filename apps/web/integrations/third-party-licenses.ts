/**
 * Astro integration: publishes `/third-party-licenses.txt`, the license texts of every
 * third-party package whose code reaches visitors' browsers (ADR 0016).
 *
 * Shipping compiled code (JavaScript and WebAssembly) requires reproducing these notices
 * (BSD, IJG, MIT, Apache-2.0). The list is explicit: when a new dependency is bundled into the
 * site, a tool UI or a worker, add it to `SHIPPED` (a unit test checks every file exists, and
 * the build fails if one is missing). Reads only local files; works offline.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..')

export interface ShippedPackage {
  name: string
  /** Workspace folder that depends on it, or the shipped package that depends on it. */
  from: { workspace: string } | { parent: string }
  /** What it is for, in a few words. */
  usedFor: string
  /** Extra license files inside the package, e.g. for bundled native code. */
  extraLicenses?: string[]
  /**
   * License texts the package does not include for code it bundles, kept verbatim from the
   * upstream release in `integrations/notices/` (fetched once, so builds stay offline).
   */
  vendoredLicenses?: string[]
  /** Facts the notice must state: bundled components, copyright lines, exact source links. */
  notes?: string[]
}

export const SHIPPED: readonly ShippedPackage[] = [
  { name: 'astro', from: { workspace: 'apps/web' }, usedFor: 'island loader' },
  { name: 'react', from: { workspace: 'apps/web' }, usedFor: 'tool interface' },
  { name: 'react-dom', from: { workspace: 'apps/web' }, usedFor: 'tool interface' },
  { name: 'scheduler', from: { parent: 'react-dom' }, usedFor: 'tool interface' },
  {
    name: '@fontsource-variable/fredoka',
    from: { workspace: 'apps/web' },
    usedFor: 'Fredoka font (headings, buttons)',
  },
  {
    name: '@fontsource-variable/figtree',
    from: { workspace: 'apps/web' },
    usedFor: 'Figtree font (body text)',
  },
  { name: 'comlink', from: { workspace: 'packages/tool-kit' }, usedFor: 'worker messaging' },
  {
    name: 'client-zip',
    from: { workspace: 'packages/tool-ui' },
    usedFor: 'ZIP downloads',
  },
  {
    name: '@jsquash/jpeg',
    from: { workspace: 'packages/engine-image' },
    usedFor: 'JPEG encoding and decoding (mozjpeg)',
    extraLicenses: ['codec/LICENSE.codec.md'],
  },
  {
    name: '@jsquash/webp',
    from: { workspace: 'packages/engine-image' },
    usedFor: 'WebP encoding and decoding (libwebp)',
    extraLicenses: ['codec/LICENSE.codec.md'],
  },
  {
    name: '@jsquash/png',
    from: { workspace: 'packages/engine-image' },
    usedFor: 'PNG decoding',
    extraLicenses: ['codec/LICENSE.codec.md'],
  },
  {
    name: '@jsquash/oxipng',
    from: { workspace: 'packages/engine-image' },
    usedFor: 'PNG optimisation (oxipng)',
    extraLicenses: ['codec/LICENSE.codec.md'],
  },
  {
    name: '@jsquash/resize',
    from: { workspace: 'packages/engine-image' },
    usedFor: 'image resizing',
    extraLicenses: [
      'lib/resize/LICENSE.codec.md',
      'lib/hqx/LICENSE.codec.md',
      'lib/magic-kernel/LICENSE.codec.md',
    ],
  },
  {
    // LGPL-3.0 (ADR 0022): libheif.wasm is served unmodified as its own file, replaceable.
    name: 'libheif-js',
    from: { workspace: 'packages/engine-image' },
    usedFor: 'HEIC decoding where the browser cannot decode HEIC (WebAssembly)',
    extraLicenses: ['libheif-wasm/LICENSE'],
    notes: [
      'Bundles libheif 1.23.2, Copyright (c) 2017-2025 Dirk Farin, under the GNU LGPL-3.0 or later. Source: https://github.com/strukturag/libheif/tree/v1.23.2',
      'Bundles libde265 1.0.15, Copyright (c) 2013-2014 struktur AG, Dirk Farin, under the GNU LGPL-3.0 or later (license text above). Source: https://github.com/strukturag/libde265/tree/v1.0.15',
      'Built as WebAssembly by libheif-js 1.23.2: https://github.com/catdad-experiments/libheif-js (build scripts: https://github.com/catdad-experiments/libheif-emscripten).',
      'The file libheif.wasm is served unmodified, as a separate file. You may replace it with your own build of these libraries; Mochifile itself is AGPL-3.0 and its full source is at https://github.com/mochifile/mochifile.',
    ],
  },
  {
    name: '@jsquash/avif',
    from: { workspace: 'packages/engine-image' },
    usedFor: 'AVIF decoding where the browser cannot decode AVIF (WebAssembly)',
    vendoredLicenses: [
      'libavif-1.0.1-LICENSE.txt',
      'libaom-3.7.0-LICENSE.txt',
      'libaom-3.7.0-PATENTS.txt',
    ],
    notes: [
      'Bundles libavif 1.0.1, Copyright 2019 Joe Drago (BSD-2-Clause). Source: https://github.com/AOMediaCodec/libavif/tree/v1.0.1',
      'Bundles the libaom 3.7.0 AV1 decoder, Copyright (c) 2016 Alliance for Open Media (BSD-2-Clause), with the Alliance for Open Media Patent License 1.0. Source: https://aomedia.googlesource.com/aom/+/refs/tags/v3.7.0',
    ],
  },
  {
    name: 'wasm-feature-detect',
    from: { parent: '@jsquash/webp' },
    usedFor: 'choosing the WebP encoder build',
  },
]

const LICENSE_NAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE']

/** Folder of a package, following pnpm's symlinks. */
export function packageDir(
  entry: ShippedPackage,
  all: readonly ShippedPackage[] = SHIPPED,
): string {
  if ('workspace' in entry.from) {
    return realpathSync(join(repoRoot, entry.from.workspace, 'node_modules', entry.name))
  }
  const parentName = entry.from.parent
  const parent = all.find((candidate) => candidate.name === parentName)
  if (!parent) throw new Error(`Unknown parent package ${parentName}`)
  // In pnpm's store, a package's dependencies are its siblings in the same node_modules.
  const parentDir = packageDir(parent, all)
  const modules = parentName.startsWith('@') ? dirname(dirname(parentDir)) : dirname(parentDir)
  return realpathSync(join(modules, entry.name))
}

export interface Notice {
  name: string
  version: string
  license: string
  usedFor: string
  notes: string[]
  texts: Array<{ file: string; text: string }>
}

const noticesDir = join(dirname(fileURLToPath(import.meta.url)), 'notices')

export function readNotice(entry: ShippedPackage): Notice {
  const dir = packageDir(entry)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    version: string
    license?: string
  }
  const main = LICENSE_NAMES.find((file) => existsSync(join(dir, file)))
  const files = [...(main ? [main] : []), ...(entry.extraLicenses ?? [])]
  if (!main) throw new Error(`${entry.name}: no license file found in ${dir}`)
  return {
    name: entry.name,
    version: pkg.version,
    license: pkg.license ?? 'see license text',
    usedFor: entry.usedFor,
    notes: entry.notes ?? [],
    texts: [
      ...files.map((file) => {
        const path = join(dir, file)
        if (!existsSync(path)) throw new Error(`${entry.name}: missing ${file}`)
        return { file, text: readFileSync(path, 'utf8').trim() }
      }),
      ...(entry.vendoredLicenses ?? []).map((file) => {
        const path = join(noticesDir, file)
        if (!existsSync(path)) throw new Error(`${entry.name}: missing notices/${file}`)
        return { file, text: readFileSync(path, 'utf8').trim() }
      }),
    ],
  }
}

export function formatNotices(notices: readonly Notice[]): string {
  const rule = '='.repeat(78)
  const header = [
    'Mochifile third-party notices',
    '',
    'Mochifile (https://mochifile.com) is free software under the GNU AGPL-3.0; source code at',
    'https://github.com/mochifile/mochifile. The site ships the following third-party code to',
    'your browser. Their licenses and notices are reproduced below.',
    '',
    ...notices.map(
      (notice) => `- ${notice.name} ${notice.version} (${notice.license}): ${notice.usedFor}`,
    ),
  ]
  const sections = notices.map((notice) =>
    [
      rule,
      `${notice.name} ${notice.version} (${notice.license})`,
      rule,
      ...(notice.notes.length > 0 ? ['', ...notice.notes.map((note) => `* ${note}`)] : []),
      ...notice.texts.flatMap(({ file, text }) => ['', `--- ${file} ---`, '', text]),
    ].join('\n'),
  )
  return `${[header.join('\n'), ...sections].join('\n\n')}\n`
}

export default function thirdPartyLicenses(): AstroIntegration {
  return {
    name: 'mochifile:third-party-licenses',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const notices = SHIPPED.map((entry) => readNotice(entry))
        await writeFile(
          join(fileURLToPath(dir), 'third-party-licenses.txt'),
          formatNotices(notices),
        )
        logger.info(`wrote notices for ${notices.length} packages`)
      },
    },
  }
}
