import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'
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

export const collections = { toolContent, pageContent }
