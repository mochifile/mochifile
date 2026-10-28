import { describe, expect, it } from 'vitest'
import { seeAllToolsHref } from './not-found.ts'

describe('seeAllToolsHref', () => {
  it('goes to Solutions, translated, when the site has it', () => {
    expect(seeAllToolsHref({ locale: 'en', hasSolutions: true, firstToolPath: '/x/' })).toBe(
      '/solutions/',
    )
    expect(seeAllToolsHref({ locale: 'pt', hasSolutions: true, firstToolPath: '/pt/x/' })).toBe(
      '/pt/solucoes/',
    )
  })

  it('falls back to the first published tool, then to the home page', () => {
    expect(
      seeAllToolsHref({
        locale: 'pt',
        hasSolutions: false,
        firstToolPath: '/pt/comprimir-imagem/',
      }),
    ).toBe('/pt/comprimir-imagem/')
    expect(seeAllToolsHref({ locale: 'pt', hasSolutions: false, firstToolPath: undefined })).toBe(
      '/pt/',
    )
    expect(seeAllToolsHref({ locale: 'en', hasSolutions: false, firstToolPath: undefined })).toBe(
      '/',
    )
  })
})
