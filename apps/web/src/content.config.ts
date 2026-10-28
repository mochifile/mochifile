import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'
import { guideSchema } from './lib/guides.ts'
import { pageCopySchema } from './lib/page-copy.ts'

/**
 * Long-form copy of tool pages (intro, how it works, tips, FAQ), written as Markdown next to
 * each tool: `packages/tools/<dir>/content/<locale>/<key>.md`, where `<key>` is `index` for
 * the main page or a variant key (ADR 0018). Rendered to static HTML at build time; none of it
 * reaches the browser as JavaScript. Short UI strings stay in Paraglide messages. The steps and
 * the FAQ are frontmatter (`pageCopySchema`), validated here, so a mistake fails the build.
 */
const toolContent = defineCollection({
  loader: glob({
    pattern: '*/content/*/*.md',
    base: '../../packages/tools',
    // `<dir>/content/<locale>/<key>.md` → `<dir>/<locale>/<key>`, matching `contentId()`.
    // The default id would slugify `_template` and lose the leading underscore.
    generateId: ({ entry }) => entry.replace('/content/', '/').replace(/\.md$/, ''),
  }),
  schema: pageCopySchema,
})

/**
 * Copy of the institutional pages (About, Sustainability, Architecture and the intro of
 * Contact): `src/content/pages/<locale>/<page id>.md`, one file per locale for every page in
 * `lib/pages.ts`. The titles, labels and form texts stay in Paraglide messages. No frontmatter:
 * there is nothing structured for the page to lay out, so a stray key fails the build.
 */
const pageContent = defineCollection({
  loader: glob({ pattern: '*/*.md', base: './src/content/pages' }),
  schema: z.object({}).strict(),
})

/**
 * Guides: `content/guides/<key>/<locale>.md`, one file per locale for every guide in
 * `guideOrder` (lib/guides.ts). A file with `draft: true` has no body and no page: it shows in
 * the list as a draft until the article is written. Rendered to static HTML at build time.
 */
const guides = defineCollection({
  // `<key>/<locale>`: the default id would be the frontmatter's `slug`, which differs per locale.
  loader: glob({
    pattern: '*/*.md',
    base: './src/content/guides',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: guideSchema,
})

export const collections = { toolContent, pageContent, guides }
