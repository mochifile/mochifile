import { z } from 'astro/zod'

/** Short enough for one or two lines beside the title, like the manifest's tagline. */
export const STEP_MAX = 60
/** The sentence under a step's title, in the card of the V2 "How it works". */
export const STEP_TEXT_MAX = 140
export const QUESTION_MAX = 90
export const ANSWER_MAX = 500

const text = (max: number) => z.string().trim().min(1).max(max)

/** A step is a line of text, or a title with a sentence under it (a card of "How it works"). */
const step = z.union([
  text(STEP_MAX),
  z.strictObject({ title: text(STEP_MAX), text: text(STEP_TEXT_MAX) }),
])

/**
 * Frontmatter of a tool page's Markdown copy (ADR 0018): the structured parts the page lays out
 * itself. `steps` are the cards of "How it works" after the tool panel; `faq` becomes native
 * `<details>` after them. Both are optional, so a page whose copy has
 * neither still builds; answers are plain text and must describe what the tool really does.
 */
export const pageCopySchema = z
  .object({
    steps: z.array(step).min(2).max(4).optional(),
    faq: z
      .array(z.strictObject({ question: text(QUESTION_MAX), answer: text(ANSWER_MAX) }))
      .min(1)
      .max(6)
      .optional(),
  })
  .strict()

export type PageCopy = z.infer<typeof pageCopySchema>

export type PageStep = NonNullable<PageCopy['steps']>[number]

/** A step's title and its sentence, if it has one. */
export function stepParts(entry: PageStep): { title: string; text: string | undefined } {
  return typeof entry === 'string' ? { title: entry, text: undefined } : entry
}
