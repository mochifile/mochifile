import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
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

export const collections = { toolContent, guides }
