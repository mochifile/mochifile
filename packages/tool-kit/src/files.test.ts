import { describe, expect, it } from 'vitest'
import { ToolError } from './errors.ts'
import { formatBytes, matchesMime, renameFile, splitFileName, validateFiles } from './files.ts'
import { validManifest } from './test-fixtures.ts'

const file = (size: number, type = 'image/png') => ({ size, type })

describe('matchesMime', () => {
  it('matches exact types and wildcards, case-insensitively', () => {
    expect(matchesMime('image/png', ['image/png'])).toBe(true)
    expect(matchesMime('IMAGE/HEIC', ['image/*'])).toBe(true)
    expect(matchesMime('video/mp4', ['image/*'])).toBe(false)
    expect(matchesMime('', ['image/*'])).toBe(false)
  })
})

describe('validateFiles', () => {
  const codeOf = (fn: () => void) => {
    try {
      fn()
    } catch (error) {
      return error instanceof ToolError ? error.code : 'not-a-tool-error'
    }
    return 'ok'
  }

  it('accepts files within limits', () => {
    expect(codeOf(() => validateFiles([file(50), file(50)], validManifest))).toBe('ok')
  })

  it('reports each limit with a specific code', () => {
    expect(codeOf(() => validateFiles([], validManifest))).toBe('no-files')
    expect(codeOf(() => validateFiles([file(1), file(1), file(1)], validManifest))).toBe(
      'too-many-files',
    )
    expect(codeOf(() => validateFiles([file(1, 'application/pdf')], validManifest))).toBe(
      'unsupported-type',
    )
    expect(codeOf(() => validateFiles([file(101)], validManifest))).toBe('file-too-large')
    expect(codeOf(() => validateFiles([file(100), file(100)], validManifest))).toBe(
      'total-too-large',
    )
  })
})

describe('formatBytes', () => {
  it('uses decimal units and the given locale', () => {
    expect(formatBytes(0)).toBe('0 byte')
    expect(formatBytes(1500)).toBe('1.5 kB')
    expect(formatBytes(2_000_000)).toBe('2 MB')
    expect(formatBytes(1_500_000, 'pt')).toBe('1,5 MB')
  })
})

describe('file names', () => {
  it('splits base and extension', () => {
    expect(splitFileName('photo.final.jpg')).toEqual({ base: 'photo.final', ext: 'jpg' })
    expect(splitFileName('.env')).toEqual({ base: '.env', ext: '' })
    expect(splitFileName('README')).toEqual({ base: 'README', ext: '' })
  })

  it('renames with a suffix and new extension', () => {
    expect(renameFile('IMG_1.heic', { suffix: 'converted', ext: 'jpg' })).toBe(
      'IMG_1-converted.jpg',
    )
    expect(renameFile('doc.pdf', { suffix: 'compressed' })).toBe('doc-compressed.pdf')
    expect(renameFile('README', { ext: 'txt' })).toBe('README.txt')
  })
})
