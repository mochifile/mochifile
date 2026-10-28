// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32 as nodeCrc32 } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import { bytes, file, readZip } from './testing/zip-testing.ts'
import { checkZipLimits, createZip, type ZipFile, zipEntries } from './zip.ts'

const build = async (files: ZipFile[], when?: Date) =>
  Buffer.from(await (await createZip(files, when)).arrayBuffer())

describe('createZip', () => {
  it('builds a valid archive of one file, with its bytes, size and CRC', async () => {
    const data = bytes(1234, 5)
    const [entry, ...rest] = readZip(await build([file('photo.jpg', data, 'image/jpeg')]))
    expect(rest).toEqual([])
    expect(entry).toMatchObject({
      name: 'photo.jpg',
      method: 0,
      size: 1234,
      crc: nodeCrc32(data),
      flags: 0x0800,
    })
    expect(entry?.data.equals(Buffer.from(data))).toBe(true)
  })

  it('builds an archive of several files of different types, in order', async () => {
    const files = [
      file('a.jpg', bytes(10_000, 1), 'image/jpeg'),
      file('b.png', bytes(777, 2), 'image/png'),
      file('c.webp', bytes(65_536, 3), 'image/webp'),
      file('d.pdf', bytes(1, 4), 'application/pdf'),
      file('e.bin', bytes(300_000, 5)),
    ]
    const entries = readZip(await build(files))
    expect(entries.map((entry) => entry.name)).toEqual([
      'a.jpg',
      'b.png',
      'c.webp',
      'd.pdf',
      'e.bin',
    ])
    for (const [i, entry] of entries.entries()) {
      const original = Buffer.from(await (files[i] as ZipFile).blob.arrayBuffer())
      expect(entry.data.equals(original), entry.name).toBe(true)
      expect(entry.crc, entry.name).toBe(nodeCrc32(original))
    }
  })

  it('does not depend on the type of each Blob, and marks the archive as a ZIP', async () => {
    const zip = await createZip([file('x.jpg', bytes(5), 'text/plain')])
    expect(zip.type).toBe('application/zip')
    expect(readZip(Buffer.from(await zip.arrayBuffer()))[0]?.size).toBe(5)
  })

  it('numbers files with the same name', async () => {
    const entries = readZip(
      await build([
        file('a.jpg', bytes(3, 1)),
        file('a.jpg', bytes(4, 2)),
        file('a.jpg', bytes(5, 3)),
      ]),
    )
    expect(entries.map((entry) => [entry.name, entry.size])).toEqual([
      ['a.jpg', 3],
      ['a (2).jpg', 4],
      ['a (3).jpg', 5],
    ])
  })

  it('stores a file of zero bytes, between others', async () => {
    const entries = readZip(
      await build([file('1', bytes(9)), file('empty.txt', new Uint8Array()), file('3', bytes(2))]),
    )
    expect(entries.map((entry) => entry.size)).toEqual([9, 0, 2])
    expect(entries[1]).toMatchObject({ name: 'empty.txt', crc: 0 })
  })

  it('makes a valid archive of no files', async () => {
    const zip = await build([])
    expect(zip.length).toBe(22)
    expect(readZip(zip)).toEqual([])
  })

  it('keeps all 256 byte values, and files that cross the slices the CRC is read in', async () => {
    const everyByte = Uint8Array.from({ length: 1024 }, (_, i) => i % 256)
    // 2 MiB slices: 5 MiB + 3 bytes is three slices, the last one of 1 MiB + 3.
    const crossing = bytes(5 * 1024 * 1024 + 3, 9)
    // Exactly two slices, and exactly one.
    const twoSlices = bytes(4 * 1024 * 1024, 10)
    const oneSlice = bytes(2 * 1024 * 1024, 11)
    const files = [
      file('bytes.bin', everyByte),
      file('crossing.bin', crossing),
      file('two.bin', twoSlices),
      file('one.bin', oneSlice),
    ]
    const entries = readZip(await build(files))
    for (const [i, entry] of entries.entries()) {
      const original = (files[i] as ZipFile).blob
      const expected = Buffer.from(await original.arrayBuffer())
      expect(entry.size, entry.name).toBe(original.size)
      expect(entry.crc, entry.name).toBe(nodeCrc32(expected))
      expect(entry.data.equals(expected), entry.name).toBe(true)
    }
  })

  it('writes names in UTF-8: accents, other scripts, emoji and decomposed letters', async () => {
    const names = ['foto ação.jpg', '写真 日本語.png', '🍡 mochi.webp', 'Cafe\u0301.jpg', 'ÿ.txt']
    const entries = readZip(await build(names.map((name, i) => file(name, bytes(3, i)))))
    expect(entries.map((entry) => entry.name)).toEqual(names)
    expect(entries.every((entry) => (entry.flags & 0x0800) !== 0)).toBe(true)
  })

  it('writes the time it is given, in MS-DOS format, and Unix permissions', async () => {
    const [entry] = readZip(await build([file('t', bytes(1))], new Date(2026, 9, 28, 14, 31, 58)))
    expect(entry?.time).toBe((14 << 11) | (31 << 5) | 29) // seconds are stored halved
    expect(entry?.date).toBe(((2026 - 1980) << 9) | (10 << 5) | 28)
    expect((entry?.madeBy ?? 0) >> 8).toBe(3)
    expect((entry?.externalAttributes ?? 0) >>> 16).toBe(0o100644)
    const [early] = readZip(await build([file('t', bytes(1))], new Date(1970, 0, 1)))
    expect((early?.date ?? 0) >> 9).toBe(0) // clamped to 1980
  })

  it('leaves the files it reads usable', async () => {
    const source = file('a.jpg', bytes(100, 1))
    await build([source])
    expect(source.blob.size).toBe(100)
    expect(Buffer.from(await source.blob.arrayBuffer()).equals(Buffer.from(bytes(100, 1)))).toBe(
      true,
    )
  })

  describe('when it cannot make the archive', () => {
    const entry = (blob: Blob) => ({ name: 'x.bin', blob })
    const withSlice = (slice: () => unknown) =>
      Object.assign(new Blob([bytes(10)]), { slice }) as unknown as Blob

    it('rejects when a file cannot be read', async () => {
      const unreadable = withSlice(() => ({
        arrayBuffer: () => Promise.reject(new Error('read failed')),
      }))
      await expect(createZip([entry(unreadable)])).rejects.toThrow('read failed')
    })

    it('rejects when a file gives fewer bytes than its size, not a wrong CRC', async () => {
      const short = withSlice(() => ({ arrayBuffer: async () => new ArrayBuffer(4) }))
      await expect(createZip([entry(short)])).rejects.toThrow('could not be read completely')
    })

    it('rejects a file of 4 GiB or more, which would need ZIP64, before reading anything', async () => {
      const huge = {
        size: 2 ** 32,
        slice: () => expect.unreachable('read a file'),
      } as unknown as Blob
      await expect(createZip([entry(huge)])).rejects.toThrow(RangeError)
    })

    it('rejects more than 65,534 files before reading anything', async () => {
      const blob = new Blob([])
      const many = Array.from({ length: 0xffff }, (_, i) => ({ name: `${i}.bin`, blob }))
      await expect(createZip(many)).rejects.toThrow('Too many files')
    })
  })
})

describe('checkZipLimits', () => {
  // Every size and offset is a 32-bit field and 0xFFFFFFFF is the ZIP64 marker: the files, their
  // headers (30 + 46 bytes and the name twice) and the directory must end by 0xFFFFFFFE.
  const MAX = 0xffff_fffe

  it('accepts the largest single file that fits, and refuses one byte more', () => {
    const nameBytes = 10
    const largest = MAX - (30 + nameBytes) - (46 + nameBytes)
    expect(() => checkZipLimits([{ size: largest, nameBytes }])).not.toThrow()
    expect(() => checkZipLimits([{ size: largest + 1, nameBytes }])).toThrow(RangeError)
  })

  it('counts every file and every header, not only the biggest file', () => {
    const half = Math.floor(MAX / 2) - 200
    expect(() =>
      checkZipLimits([
        { size: half, nameBytes: 5 },
        { size: half, nameBytes: 5 },
      ]),
    ).not.toThrow()
    expect(() =>
      checkZipLimits([
        { size: half, nameBytes: 5 },
        { size: half + 400, nameBytes: 5 },
      ]),
    ).toThrow(RangeError)
  })

  it('accepts 65,534 files and refuses 65,535', () => {
    const files = (count: number) =>
      Array.from({ length: count }, () => ({ size: 0, nameBytes: 5 }))
    expect(() => checkZipLimits(files(0xfffe))).not.toThrow()
    expect(() => checkZipLimits(files(0xffff))).toThrow('Too many files')
  })
})

// The archive is also read by programs that have nothing to do with this code. They are used when
// they exist on the machine (they do on the CI runners and on macOS and Linux developers' ones).
const hasTool = (command: string) =>
  (spawnSync(command, ['--version']).error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT'
const directory = mkdtempSync(join(tmpdir(), 'mochifile-zip-'))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

/** The files of an archive that stress what other programs read: names, sizes, slices, types. */
const sample = (): ZipFile[] => [
  file('photo.jpg', bytes(100_000, 1), 'image/jpeg'),
  file('photo.jpg', bytes(2_097_152, 2), 'image/jpeg'),
  file('foto ação 日本語 🍡.png', bytes(5 * 1024 * 1024 + 3, 3), 'image/png'),
  file('empty.webp', new Uint8Array(), 'image/webp'),
  file(
    'every byte.bin',
    Uint8Array.from({ length: 4096 }, (_, i) => i % 256),
  ),
]

async function writeSample() {
  const files = sample()
  const entries = zipEntries(files)
  const path = join(directory, `${Math.random().toString(36).slice(2)}.zip`)
  writeFileSync(path, Buffer.from(await (await createZip(files)).arrayBuffer()))
  return { path, entries }
}

describe('independent readers', () => {
  it.skipIf(!hasTool('unzip'))('unzip -t finds no errors in any file', async () => {
    const { path, entries } = await writeSample()
    const test = spawnSync('unzip', ['-t', path], { encoding: 'utf8' })
    expect(test.status, test.stdout + test.stderr).toBe(0)
    expect(test.stdout).toContain('No errors detected')
    expect(test.stdout.match(/testing: .*\bOK$/gm)).toHaveLength(entries.length)
    // Info-ZIP's unzip prints names that are not ASCII in its own way, depending on the
    // locale; the exact names are checked with Python below.
    for (const { name } of entries.filter(({ name }) => /^[\x20-\x7e]+$/.test(name))) {
      expect(test.stdout).toContain(name)
    }
  })

  it.skipIf(!hasTool('python3'))('Python zipfile reads names, sizes, CRCs and bytes', async () => {
    const { path, entries } = await writeSample()
    const script = [
      'import hashlib, json, sys, zipfile',
      'z = zipfile.ZipFile(sys.argv[1])',
      'print(json.dumps({"bad": z.testzip(), "entries": [',
      '  {"name": i.filename, "size": i.file_size, "crc": i.CRC, "method": i.compress_type,',
      '   "sha256": hashlib.sha256(z.read(i)).hexdigest()} for i in z.infolist()]}))',
    ].join('\n')
    const run = spawnSync('python3', ['-I', '-c', script, path], { encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(0)
    const result = JSON.parse(run.stdout) as {
      bad: string | null
      entries: Array<{ name: string; size: number; crc: number; method: number; sha256: string }>
    }
    expect(result.bad).toBeNull()
    const expected = await Promise.all(
      entries.map(async ({ name, blob }) => {
        const data = Buffer.from(await blob.arrayBuffer())
        return {
          name,
          size: data.length,
          crc: nodeCrc32(data),
          method: 0,
          sha256: createHash('sha256').update(data).digest('hex'),
        }
      }),
    )
    expect(result.entries).toEqual(expected)
  })

  it.skipIf(!hasTool('python3'))('Python reads an archive of no files', async () => {
    const path = join(directory, 'empty.zip')
    writeFileSync(path, Buffer.from(await (await createZip([])).arrayBuffer()))
    const script = 'import sys, zipfile; print(len(zipfile.ZipFile(sys.argv[1]).namelist()))'
    const run = spawnSync('python3', ['-I', '-c', script, path], { encoding: 'utf8' })
    expect(run.stdout.trim()).toBe('0')
  })
})
