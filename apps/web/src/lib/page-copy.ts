import { z } from 'astro/zod'

/** Short enough for one or two lines beside the title, like the manifest's tagline. */
export const STEP_MAX = 60
export const QUESTION_MAX = 90
export const ANSWER_MAX = 500

const text = (max: number) => z.string().trim().min(1).max(max)

/**
 * Frontmatter of a tool page's Markdown copy (ADR 0018): the structured parts the page lays out
 * itself. `steps` are shown beside the title from 1024 px and after the tool panel below it;
 * `faq` becomes native `<details>` after the copy. Both are optional, so a page whose copy has
 * neither still builds; answers are plain text and must describe what the tool really does.
 */
export const pageCopySchema = z
  .object({
    steps: z.array(text(STEP_MAX)).min(2).max(4).optional(),
    faq: z
      .array(z.strictObject({ question: text(QUESTION_MAX), answer: text(ANSWER_MAX) }))
      .min(1)
      .max(6)
      .optional(),
  })
  .strict()

export type PageCopy = z.infer<typeof pageCopySchema>
