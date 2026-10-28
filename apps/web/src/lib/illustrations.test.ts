import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cardImage } from './card-images.ts'
import { illustration } from './illustrations.ts'

const FOLDER = new URL('../assets/illustrations/', import.meta.url)

/** Sheets and category art are shipped at 1x and 2x; expressions at one size, 3x their box. */
const PAIR = [720, 1440]
const EXPRESSION = [288]

function widthsOnDisk(name: string) {
  return readdirSync(FOLDER)
    .flatMap((file) => {
      const match = /^(.+)-(\d+)\.webp$/.exec(file)
      return match?.[1] === name ? [Number(match[2])] : []
    })
    .sort((a, b) => a - b)
}

describe('illustrations', () => {
  it('names every shipped file <name>-<width>.webp, in the widths its kind comes in', () => {
    const names = new Set<string>()
    for (const file of readdirSync(FOLDER)) {
      if (file === 'library') continue
      const match = /^(sheet|use|expr)-([a-z]+)-(\d+)\.webp$/.exec(file)
      expect(match, `${file} is named kind-name-width.webp`).not.toBeNull()
      names.add(`${match?.[1]}-${match?.[2]}`)
    }
    for (const name of names) {
      expect(widthsOnDisk(name), name).toEqual(name.startsWith('expr-') ? EXPRESSION : PAIR)
    }
  })

  it('keeps the unused art in a subfolder, out of the build until a page uses it', () => {
    const library = readdirSync(new URL('library/', FOLDER))
    expect(library).toContain('sheet-done-1440.webp')
    expect(library).toContain('sheet-sleepy-1440.webp')
    expect(() => illustration('sheet-sleepy')).toThrow(/No illustration named/)
  })

  it('gives a sheet its whole ladder, the 1x file as the fallback and its size as the box', () => {
    const lost = illustration('sheet-lost', '320px')
    expect(lost.src).toContain('sheet-lost-720')
    expect(lost).toMatchObject({ width: 720, height: 426, sizes: '320px' })
    expect(lost.srcset).toMatch(/sheet-lost-720\S+ 720w, \S*sheet-lost-1440\S+ 1440w$/)
  })

  it('gives an expression one file and no srcset', () => {
    const normal = illustration('expr-normal')
    expect(normal.width).toBe(288)
    expect(normal).not.toHaveProperty('srcset')
  })

  it('fails loudly on a name that is not there, so a typo never ships a broken image', () => {
    expect(() => illustration('sheet-nope')).toThrow(/sheet-nope/)
  })

  it('serves the category cards from the 720 and 1440 px files', () => {
    for (const name of ['images', 'pdf', 'video'] as const) {
      const image = cardImage(name)
      expect(image.srcset, name).toContain('720w')
      expect(image.srcset, name).toContain('1440w')
      expect(image.width).toBe(720)
    }
  })
})
