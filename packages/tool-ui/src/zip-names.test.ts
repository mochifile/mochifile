// @vitest-environment node
import { crc32 as nodeCrc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { bytes, file, readZip } from './testing/zip-testing.ts'
import { createZip, type ZipFile, zipEntries } from './zip.ts'

const blob = new Blob([])
const named = (...names: string[]): ZipFile[] => names.map((name) => ({ name, blob }))
/** The names `zipEntries` gives to files called `names`. */
const namesOf = (...names: string[]) => zipEntries(named(...names)).map((entry) => entry.name)

const utf8Bytes = (text: string) => new TextEncoder().encode(text).length
/** What may not be in an entry's name: separators, what Windows refuses, control characters. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it looks for
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]/
const NFC_CAFE = 'caf\u00e9.jpg'
const NFD_CAFE = 'cafe\u0301.jpg'

describe('names of the entries', () => {
  it('numbers repeated names before the extension, in the order given', () => {
    expect(namesOf('photo.jpg', 'photo.jpg', 'photo.jpg', 'photo.jpg')).toEqual([
      'photo.jpg',
      'photo (2).jpg',
      'photo (3).jpg',
      'photo (4).jpg',
    ])
    expect(namesOf('README', 'README', 'a.tar.gz', 'a.tar.gz')).toEqual([
      'README',
      'README (2)',
      'a.tar.gz',
      'a.tar (2).gz',
    ])
    expect(namesOf('.hidden', '.hidden')).toEqual(['.hidden', '.hidden (2)'])
  })

  describe('letters that differ only in case', () => {
    it('numbers `photo.jpg` after `Photo.JPG`, keeping each name as it was', () => {
      expect(namesOf('Photo.JPG', 'photo.jpg', 'PHOTO.jpg', 'photo.jpg')).toEqual([
        'Photo.JPG',
        'photo (2).jpg',
        'PHOTO (3).jpg',
        'photo (4).jpg',
      ])
    })

    it('also joins what only some case tables join (ß and SS, ς σ Σ, the Kelvin sign)', () => {
      expect(namesOf('ß.jpg', 'SS.jpg')).toEqual(['ß.jpg', 'SS (2).jpg'])
      expect(namesOf('σ.jpg', 'ς.jpg', 'Σ.jpg')).toEqual(['σ.jpg', 'ς (2).jpg', 'Σ (3).jpg'])
      expect(namesOf('k.jpg', '\u212a.jpg')).toEqual(['k.jpg', '\u212a (2).jpg'])
    })
  })

  describe('the same accent written two ways (Unicode normalization)', () => {
    it('numbers the second of an NFC and an NFD name, in either order', () => {
      expect(namesOf(NFC_CAFE, NFD_CAFE)).toEqual([NFC_CAFE, 'cafe\u0301 (2).jpg'])
      expect(namesOf(NFD_CAFE, NFC_CAFE)).toEqual([NFD_CAFE, 'caf\u00e9 (2).jpg'])
    })

    it('joins singletons and compositions that are canonically equivalent', () => {
      // U+212B ANGSTROM SIGN is canonically equivalent to U+00C5 and to A + U+030A.
      expect(namesOf('\u00c5.png', '\u212b.png', 'A\u030a.png')).toEqual([
        '\u00c5.png',
        '\u212b (2).png',
        'A\u030a (3).png',
      ])
    })

    it('does not join names that are different letters', () => {
      expect(namesOf('e.jpg', 'é.jpg', 'è.jpg')).toEqual(['e.jpg', 'é.jpg', 'è.jpg'])
    })
  })

  describe('names that only become the same when cleaned', () => {
    it('numbers names that collide after `/`, `\\` and `:` become `_`', () => {
      expect(namesOf('a/b.jpg', 'a_b.jpg', 'a\\b.jpg', 'a:b.jpg')).toEqual([
        'a_b.jpg',
        'a_b (2).jpg',
        'a_b (3).jpg',
        'a_b (4).jpg',
      ])
    })

    it('numbers names that collide once trailing dots and spaces are gone', () => {
      expect(namesOf('report.', 'report', 'report. ', 'Report')).toEqual([
        'report',
        'report (2)',
        'report (3)',
        'Report (4)',
      ])
    })

    it('numbers two different unpaired surrogates, which both become U+FFFD', () => {
      expect(namesOf('a\ud800.jpg', 'a\udc00.jpg')).toEqual(['a\ufffd.jpg', 'a\ufffd (2).jpg'])
    })
  })

  describe('numbers that are already in the names', () => {
    it('never gives a number another entry has, whatever the order', () => {
      expect(namesOf('a.jpg', 'a (2).jpg', 'a.jpg')).toEqual(['a.jpg', 'a (2).jpg', 'a (3).jpg'])
      expect(namesOf('a (2).jpg', 'a.jpg', 'a.jpg')).toEqual(['a (2).jpg', 'a.jpg', 'a (3).jpg'])
      expect(namesOf('a.jpg', 'a.jpg', 'a (2).jpg')).toEqual([
        'a.jpg',
        'a (2).jpg',
        'a (2) (2).jpg',
      ])
      expect(namesOf('a (2).jpg', 'a (2).jpg', 'A (2).JPG')).toEqual([
        'a (2).jpg',
        'a (2) (2).jpg',
        'A (2) (3).JPG',
      ])
    })
  })

  describe('names Windows reserves for devices', () => {
    it('puts `_` before them, whatever their case and extension', () => {
      expect(
        namesOf(
          'CON',
          'con.txt',
          'PRN.tar.gz',
          'aux',
          'NUL',
          'Com1',
          'com9.jpg',
          'LPT1.png',
          'lpt9',
        ),
      ).toEqual([
        '_CON',
        '_con.txt',
        '_PRN.tar.gz',
        '_aux',
        '_NUL',
        '_Com1',
        '_com9.jpg',
        '_LPT1.png',
        '_lpt9',
      ])
      expect(namesOf('NUL .txt', 'COM\u00b9.txt', 'CON.')).toEqual([
        '_NUL .txt',
        '_COM\u00b9.txt',
        '_CON',
      ])
    })

    it('leaves alone the names that only look like them', () => {
      const safe = [
        'COM10.jpg',
        'CONSOLE.jpg',
        'AUXILIARY',
        'my.con',
        'CON-1.jpg',
        'xNUL',
        'LPT.jpg',
      ]
      expect(namesOf(...safe)).toEqual(safe)
    })

    it('still numbers the ones that become the same', () => {
      expect(namesOf('CON.txt', 'con.txt', '_con.txt')).toEqual([
        '_CON.txt',
        '_con (2).txt',
        '_con (3).txt',
      ])
    })
  })

  describe('dots and spaces at the end (Windows removes them)', () => {
    it('removes them, and keeps the ones inside the name', () => {
      expect(namesOf('photo.', 'photo. ', 'a.jpg.', 'a.jpg  ', 'my photo .jpg', 'x.y.')).toEqual([
        'photo',
        'photo (2)',
        'a.jpg',
        'a (2).jpg',
        'my photo .jpg',
        'x.y',
      ])
    })
  })

  describe('names that are empty or only dots and spaces', () => {
    it('become `file`, and are numbered like any other', () => {
      expect(namesOf('', '.', '..', '...', ' ', '. .')).toEqual([
        'file',
        'file (2)',
        'file (3)',
        'file (4)',
        'file (5)',
        'file (6)',
      ])
    })
  })

  describe('folders and characters that cannot be in a file name', () => {
    it('cannot point to a folder, inside or outside the one extracted to', () => {
      expect(namesOf('../../etc/passwd', '/abs.jpg', 'C:\\Users\\me\\photo.jpg', 'a/../b')).toEqual(
        ['.._.._etc_passwd', '_abs.jpg', 'C__Users_me_photo.jpg', 'a_.._b'],
      )
    })

    it('replaces control characters and what Windows refuses', () => {
      expect(
        namesOf('tab\there\n.jpg', 'a\u0000b', 'del\u007f.jpg', 'a<b>c:d"e|f?g*h.jpg'),
      ).toEqual(['tab_here_.jpg', 'a_b', 'del_.jpg', 'a_b_c_d_e_f_g_h.jpg'])
    })
  })

  describe('Unicode', () => {
    it('keeps letters, other scripts and emoji as they are', () => {
      const names = [
        'foto ação.jpg',
        '写真 日本語.png',
        '🍡 mochi.webp',
        'ÿ.txt',
        'نموذج.pdf',
        'ห้อง.jpg',
      ]
      expect(namesOf(...names)).toEqual(names)
    })

    it('turns an unpaired surrogate into U+FFFD and leaves a valid pair alone', () => {
      expect(namesOf('a\ud800b.jpg', 'x\udc00', '🍡\ud83c.png', '\ud83c\udf61.jpg')).toEqual([
        'a\ufffdb.jpg',
        'x\ufffd',
        '🍡\ufffd.png',
        '🍡.jpg',
      ])
    })
  })

  describe('very long names', () => {
    const decodes = (text: string) => {
      new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(text))
      return !text.includes('\ufffd')
    }

    it('are cut to 255 bytes and keep their extension', () => {
      const [name] = namesOf(`${'a'.repeat(300)}.jpg`)
      expect(utf8Bytes(name as string)).toBe(255)
      expect(name).toBe(`${'a'.repeat(251)}.jpg`)
    })

    it('are never cut in the middle of a character', () => {
      for (const unit of ['あ', '🍡', 'é', 'e\u0301']) {
        const [name] = namesOf(`${unit.repeat(200)}.png`)
        expect(utf8Bytes(name as string)).toBeLessThanOrEqual(255)
        expect(name?.endsWith('.png')).toBe(true)
        expect(decodes(name as string)).toBe(true)
      }
    })

    it('stay different from each other, with numbers that fit, when they only differ at the end', () => {
      const long = 'x'.repeat(300)
      const result = namesOf(`${long}A.jpg`, `${long}B.jpg`, `${long}A.jpg`, `${long}a.jpg`)
      expect(new Set(result.map((name) => name.toLowerCase())).size).toBe(4)
      for (const name of result) {
        expect(utf8Bytes(name)).toBeLessThanOrEqual(255)
        expect(name.endsWith('.jpg')).toBe(true)
      }
      expect(result[1]).toMatch(/ \(2\)\.jpg$/)
    })

    it('numbers many repeats of one long name within the limit', () => {
      const result = namesOf(...Array.from({ length: 120 }, () => `${'あ'.repeat(120)}.jpg`))
      expect(new Set(result).size).toBe(120)
      expect(Math.max(...result.map(utf8Bytes))).toBeLessThanOrEqual(255)
      expect(result[119]).toMatch(/ \(120\)\.jpg$/)
    })

    it('cut a very long extension together with the rest, since it is not an extension', () => {
      const [name] = namesOf(`photo.${'e'.repeat(400)}`)
      expect(utf8Bytes(name as string)).toBe(255)
      expect(name?.startsWith('photo.eee')).toBe(true)
    })

    it('do not end in a dot or a space after being cut', () => {
      const [name] = namesOf(`${'a'.repeat(254)} b`)
      expect(utf8Bytes(name as string)).toBeLessThanOrEqual(255)
      expect(name).toBe('a'.repeat(254))
    })
  })

  describe('whatever the names are', () => {
    // Characters that make trouble: case and accents, separators, Windows' rules, surrogates.
    const alphabet = [
      'a',
      'A',
      'b',
      'S',
      's',
      'ß',
      'σ',
      'ς',
      'Σ',
      'é',
      'e\u0301',
      'É',
      '\u212b',
      'Å',
      '.',
      ' ',
      '/',
      '\\',
      ':',
      '*',
      '(2)',
      ' (2)',
      'CON',
      'con',
      'nul',
      '\ud800',
      '\udc00',
      '🍡',
      '\n',
      '_',
      '.jpg',
      '.JPG',
      '..',
    ]
    const generate = (count: number, seed: number) => {
      let x = seed
      const next = (n: number) => {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0
        return (x >>> 8) % n
      }
      return Array.from({ length: count }, () => {
        const pieces = Array.from(
          { length: next(7) },
          () => alphabet[next(alphabet.length)] as string,
        )
        return next(40) === 0 ? pieces.join('').repeat(60) : pieces.join('')
      })
    }
    // A check written differently from the one in the code: decompose and lower-case.
    const looseKey = (name: string) => name.normalize('NFD').toLowerCase()
    const windowsDevice = /^(con|prn|aux|nul|(com|lpt)[0-9\u00b9\u00b2\u00b3])$/i

    for (const seed of [1, 2, 3, 4, 5]) {
      it(`gives unique, safe, short names (random set ${seed})`, () => {
        const input = generate(600, seed)
        const result = zipEntries(named(...input)).map((entry) => entry.name)
        expect(result).toHaveLength(input.length)
        const seen = new Set<string>()
        for (const name of result) {
          // Different for case-insensitive and normalization-insensitive file systems.
          expect(seen.has(looseKey(name)), JSON.stringify(name)).toBe(false)
          seen.add(looseKey(name))
          expect(utf8Bytes(name)).toBeLessThanOrEqual(255)
          expect(name, 'not empty').not.toBe('')
          expect(name).not.toMatch(UNSAFE)
          expect(name, 'no dot or space at the end').not.toMatch(/[. ]$/)
          expect(name.split('.')[0]?.trimEnd() ?? '', 'no device name').not.toMatch(windowsDevice)
          // Well formed: it survives a trip through UTF-8 unchanged.
          expect(new TextDecoder().decode(new TextEncoder().encode(name))).toBe(name)
        }
      })
    }

    it('is deterministic, keeps the order, and gives the same names to its own result', () => {
      const input = generate(600, 9)
      const first = zipEntries(named(...input)).map((entry) => entry.name)
      expect(zipEntries(named(...input)).map((entry) => entry.name)).toEqual(first)
      expect(zipEntries(named(...first)).map((entry) => entry.name)).toEqual(first)
    })

    it('does not change a name that is already safe and different from the others', () => {
      const safe = [
        'photo.jpg',
        'Foto ação.png',
        'IMG_0412.HEIC',
        'a (2).jpg',
        '写真.webp',
        'x.tar.gz',
      ]
      expect(namesOf(...safe)).toEqual(safe)
    })
  })
})

describe('createZip names the entries itself', () => {
  it('stores every file, whole, when the names given would make them overwrite each other', async () => {
    const names = [
      'Photo.JPG',
      'photo.jpg',
      NFC_CAFE,
      NFD_CAFE,
      'a/b.jpg',
      'a_b.jpg',
      'a\\b.jpg',
      'CON.txt',
      'con.txt',
      'report.',
      'report',
      'a\ud800.jpg',
      'a\udc00.jpg',
      '',
      '..',
      `${'x'.repeat(300)}.jpg`,
      `${'x'.repeat(300)}.jpg`,
    ]
    const files = names.map((name, i) => file(name, bytes(500 + i * 37, i + 1), 'image/jpeg'))
    const entries = readZip(Buffer.from(await (await createZip(files)).arrayBuffer()))

    expect(entries).toHaveLength(files.length)
    const loose = new Set(entries.map((entry) => entry.name.normalize('NFD').toLowerCase()))
    expect(loose.size, 'no two entries are the same file for a file system').toBe(files.length)
    for (const [i, entry] of entries.entries()) {
      const original = Buffer.from(await (files[i] as ZipFile).blob.arrayBuffer())
      expect(entry.data.equals(original), `${JSON.stringify(names[i])} → ${entry.name}`).toBe(true)
      expect(entry.crc).toBe(nodeCrc32(original))
      expect(entry.name).not.toMatch(UNSAFE)
    }
    expect(entries.map((entry) => entry.name).slice(0, 4)).toEqual([
      'Photo.JPG',
      'photo (2).jpg',
      NFC_CAFE,
      'cafe\u0301 (2).jpg',
    ])
  })

  it('writes the names `zipEntries` gives, in UTF-8', async () => {
    const files = named('Photo.JPG', 'photo.jpg', NFC_CAFE, NFD_CAFE, 'a\ud800.jpg', 'CON')
    const entries = readZip(Buffer.from(await (await createZip(files)).arrayBuffer()))
    expect(entries.map((entry) => entry.name)).toEqual(zipEntries(files).map((entry) => entry.name))
  })
})
