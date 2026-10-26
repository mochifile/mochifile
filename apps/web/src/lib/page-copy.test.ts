import { describe, expect, it } from 'vitest'
import { ANSWER_MAX, pageCopySchema, QUESTION_MAX, STEP_MAX } from './page-copy.ts'

const faq = [{ question: 'Does my file leave my device?', answer: 'No.' }]

describe('pageCopySchema', () => {
  it('accepts steps and a FAQ', () => {
    const copy = { steps: ['Choose', 'Add', 'Download'], faq }
    expect(pageCopySchema.parse(copy)).toEqual(copy)
  })

  it('accepts copy with neither, so a page without them still builds', () => {
    expect(pageCopySchema.parse({})).toEqual({})
  })

  it('trims text', () => {
    expect(pageCopySchema.parse({ steps: [' Choose ', 'Add'] }).steps).toEqual(['Choose', 'Add'])
  })

  it.each([
    ['one step', { steps: ['Choose'] }],
    ['five steps', { steps: ['1', '2', '3', '4', '5'] }],
    ['an empty step', { steps: ['Choose', '  '] }],
    ['a long step', { steps: ['Choose', 'x'.repeat(STEP_MAX + 1)] }],
    ['an empty FAQ', { faq: [] }],
    ['seven questions', { faq: Array.from({ length: 7 }, () => faq[0]) }],
    ['a question without an answer', { faq: [{ question: 'Why?', answer: '' }] }],
    ['a long question', { faq: [{ question: 'x'.repeat(QUESTION_MAX + 1), answer: 'No.' }] }],
    ['a long answer', { faq: [{ question: 'Why?', answer: 'x'.repeat(ANSWER_MAX + 1) }] }],
    ['an unknown FAQ field', { faq: [{ question: 'Why?', answer: 'No.', link: '/' }] }],
    ['an unknown field', { title: 'Not here' }],
  ])('rejects %s', (_, copy) => {
    expect(pageCopySchema.safeParse(copy).success).toBe(false)
  })
})
