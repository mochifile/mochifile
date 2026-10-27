/**
 * Astro integration: gives every non-default locale its 404 page at `<locale>/404.html`.
 *
 * Cloudflare (`not_found_handling: "404-page"`, ADR 0013) answers an unknown path with the
 * nearest `404.html` up from it, so `/pt/nope/` gets `pt/404.html` and everything else gets
 * `404.html`. Astro writes `404.html` only for the root page: with `build.format: 'directory'`,
 * `pages/pt/404.astro` becomes `pt/404/index.html`, which Cloudflare would serve only at
 * `/pt/404/` and with status 200. This moves it where Cloudflare looks.
 *
 * The 404 pages are not indexable, so `isNotFoundPage` keeps them out of the sitemap.
 */
import { rename, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'

/** Whether a page URL is a locale's 404 page as Astro lists it (`/404/`, `/pt/404/`). */
export function isNotFoundPage(pageUrl: string): boolean {
  return /^\/(?:[^/]+\/)?404\/$/.test(new URL(pageUrl).pathname)
}

/**
 * Moves `<root>/<locale>/404/index.html` to `<root>/<locale>/404.html` for each locale.
 * Throws if a locale has no 404 page, so a new locale cannot ship without one.
 */
export async function moveNotFoundPages(root: string, locales: readonly string[]): Promise<void> {
  for (const locale of locales) {
    const folder = join(root, locale, '404')
    try {
      await rename(join(folder, 'index.html'), join(root, locale, '404.html'))
    } catch (error) {
      throw new Error(`locale-not-found: no 404 page for "${locale}" (pages/${locale}/404.astro)`, {
        cause: error,
      })
    }
    await rmdir(folder)
  }
}

/** @param locales the locales served under `/<locale>/` (every locale but the default). */
export default function localeNotFound({
  locales,
}: {
  locales: readonly string[]
}): AstroIntegration {
  return {
    name: 'mochifile:locale-not-found',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        await moveNotFoundPages(fileURLToPath(dir), locales)
        logger.info(`404 pages for ${locales.map((locale) => `/${locale}/`).join(', ')}`)
      },
    },
  }
}
