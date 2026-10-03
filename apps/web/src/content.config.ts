import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

/**
 * Long-form copy of tool pages (intro, how it works, tips, FAQ), written as Markdown next to
 * each tool: `packages/tools/<dir>/content/<locale>/<key>.md`, where `<key>` is `index` for
 * the main page or a variant key (ADR 0018). Rendered to static HTML at build time; none of it
 * reaches the browser as JavaScript. Short UI strings stay in Paraglide messages.
 */
const toolContent = defineCollection({
  loader: glob({
    pattern: '*/content/*/*.md',
    base: '../../packages/tools',
    // `<dir>/content/<locale>/<key>.md` → `<dir>/<locale>/<key>`, matching `contentId()`.
    // The default id would slugify `_template` and lose the leading underscore.
    generateId: ({ entry }) => entry.replace('/content/', '/').replace(/\.md$/, ''),
  }),
})

export const collections = { toolContent }
