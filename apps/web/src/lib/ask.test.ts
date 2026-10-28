import { describe, expect, it } from 'vitest'
import { askPaths, exampleLanguages } from './ask.ts'

describe('ask page data', () => {
  it('has one page per language', () => {
    expect(askPaths).toEqual({ en: '/ask/', pt: '/pt/pergunte/' })
  })

  it('draws the six example languages, with a sample only where it has been written', () => {
    expect(exampleLanguages.map((language) => language.tag)).toEqual([
      'en',
      'pt-BR',
      'es',
      'fr',
      'hi',
      'zh-CN',
    ])
    expect(
      exampleLanguages.filter((language) => 'sample' in language).map((language) => language.tag),
    ).toEqual(['en', 'pt-BR'])
  })
})
