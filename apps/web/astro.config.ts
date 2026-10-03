import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import { defaultLocale, locales } from '@mochifile/i18n'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import cspHashes from './integrations/csp-hashes.ts'
import searchIndexing from './integrations/search-indexing.ts'
import { ALLOW_SEARCH_INDEXING } from './search-indexing.ts'

export const SITE_URL = 'https://mochifile.com'

/** Include the `_template` tool in a production build (used by e2e tests only). */
const includeTemplateTool = process.env.MOCHIFILE_INCLUDE_TEMPLATE === 'true'

export default defineConfig({
  site: SITE_URL,
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
    sitemap({
      i18n: {
        defaultLocale,
        locales: Object.fromEntries(locales.map((locale) => [locale, locale])),
      },
    }),
    // Pre-launch noindex switch: see search-indexing.ts and ADR 0014.
    searchIndexing({ allowIndexing: ALLOW_SEARCH_INDEXING }),
    // Must run after every other integration has written its HTML.
    cspHashes(),
  ],
  vite: {
    plugins: [tailwindcss()],
    worker: { format: 'es' },
    define: {
      // Statically replaced, so production builds drop the template tool's code entirely.
      'import.meta.env.MOCHIFILE_INCLUDE_TEMPLATE': JSON.stringify(includeTemplateTool),
    },
  },
})
