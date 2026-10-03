import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import { defaultLocale, locales } from '@mochifile/i18n'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, fontProviders } from 'astro/config'
import designTokens from '../../docs/design-system/tokens.json' with { type: 'json' }
import cspHashes from './integrations/csp-hashes.ts'
import searchIndexing from './integrations/search-indexing.ts'
import sitemapAlternates from './integrations/sitemap-alternates.ts'
import thirdPartyLicenses from './integrations/third-party-licenses.ts'
import { ALLOW_SEARCH_INDEXING } from './search-indexing.ts'

export const SITE_URL = 'https://mochifile.com'

/** Include the `_template` tool in a production build (used by e2e tests only). */
const includeTemplateTool = process.env.MOCHIFILE_INCLUDE_TEMPLATE === 'true'

const alternates = sitemapAlternates()

const require = createRequire(import.meta.url)
/** A woff2 file shipped by a pinned @fontsource-variable package (self-hosted, ADR 0020). */
const fontFile = (pkg: string, file: string) =>
  pathToFileURL(join(dirname(require.resolve(`${pkg}/LICENSE`)), 'files', file))
/** `Fredoka, "Noto Sans", system-ui, sans-serif` → `["Noto Sans", "system-ui", "sans-serif"]`. */
const fallbacksOf = (family: string) =>
  family
    .split(',')
    .slice(1)
    .map((name) => name.trim().replace(/^"(.*)"$/, '$1'))

export default defineConfig({
  site: SITE_URL,
  // Brand fonts, self-hosted from npm (the CSP allows only 'self'; builds stay offline). Only
  // the Latin subset is shipped: en and pt need nothing else, and it includes the dotless ı of
  // the wordmark. Fallbacks come from tokens.json; Astro adds metric-matched fallback faces so
  // text does not shift when the fonts arrive. Noto Sans stays in the stack, not downloaded.
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Fredoka',
      cssVariable: '--font-fredoka',
      fallbacks: fallbacksOf(designTokens.type.families.display),
      options: {
        variants: [
          {
            src: [fontFile('@fontsource-variable/fredoka', 'fredoka-latin-wght-normal.woff2')],
            weight: '300 700',
            style: 'normal',
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Figtree',
      cssVariable: '--font-figtree',
      fallbacks: fallbacksOf(designTokens.type.families.sans),
      options: {
        variants: [
          {
            src: [fontFile('@fontsource-variable/figtree', 'figtree-latin-wght-normal.woff2')],
            weight: '300 900',
            style: 'normal',
          },
        ],
      },
    },
  ],
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // External stylesheets only, so the CSP needs no 'unsafe-inline' for styles.
    inlineStylesheets: 'never',
  },
  i18n: {
    locales: [...locales],
    defaultLocale,
    routing: {
      // English lives at the root; other locales under /<locale>/.
      prefixDefaultLocale: false,
      // Never redirect based on the visitor's language (ADR 0007).
      redirectToDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    alternates.integration,
    // hreflang alternates come from each built page, not from sitemap's i18n option, which
    // assumes the same path in every locale (wrong for translated tool slugs).
    sitemap({ serialize: alternates.serialize }),
    // Pre-launch noindex switch: see search-indexing.ts and ADR 0014.
    searchIndexing({ allowIndexing: ALLOW_SEARCH_INDEXING }),
    // /third-party-licenses.txt: notices of the code shipped to browsers (ADR 0016).
    thirdPartyLicenses(),
    // Must run after every other integration has written its HTML.
    cspHashes(),
  ],
  vite: {
    plugins: [tailwindcss()],
    worker: { format: 'es' },
    // jSquash loads its .wasm files relative to its own modules; pre-bundling breaks that in dev.
    optimizeDeps: {
      exclude: [
        '@jsquash/jpeg',
        '@jsquash/webp',
        '@jsquash/png',
        '@jsquash/oxipng',
        '@jsquash/resize',
      ],
    },
    define: {
      // Statically replaced, so production builds drop the template tool's code entirely.
      'import.meta.env.MOCHIFILE_INCLUDE_TEMPLATE': JSON.stringify(includeTemplateTool),
    },
  },
})
