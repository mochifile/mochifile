// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32 as nodeCrc32 } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import { createZip, type ZipFile, zipEntries } from './zip.ts'

/** Deterministic bytes, so a failure can be reproduced. */
function bytes(length: number, seed = 1): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length)
  let x = seed
  for (let i = 0; i < length; i += 1) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    out[i] = x >>> 24
  }
  return out
}

const file = (name: string, data: Uint8Array<ArrayBuffer>, type = ''): ZipFile => ({
  name,
  blob: new Blob([data], { type }),
})

interface ReadEntry {
  name: string
  flags: number
  method: number
  crc: number
  size: number
  time: number
  date: number
  madeBy: number
  externalAttributes: number
  data: Buffer
}

/**
 * A reader written for these tests, from the format's specification and without the code under
 * test: it checks the end record, the directory, every local header against its directory entry,
 * and that the pieces follow each other with no gaps.
 */
function readZip(zip: Buffer): ReadEntry[] {
  const end = zip.length - 22
  expect(zip.readUInt32LE(end)).toBe(0x06054b50)
  expect(zip.readUInt16LE(end + 20)).toBe(0) // no comment, so the record is the last 22 bytes
  const count = zip.readUInt16LE(end + 10)
  expect(zip.readUInt16LE(end + 8)).toBe(count)
  const directorySize = zip.readUInt32LE(end + 12)
  const directoryOffset = zip.readUInt32LE(end + 16)
  expect(directoryOffset + directorySize).toBe(end)

  const entries: ReadEntry[] = []
  let at = directoryOffset
  let expectedLocal = 0
  for (let i = 0; i < count; i += 1) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50)
    const nameLength = zip.readUInt16LE(at + 28)
    expect(zip.readUInt16LE(at + 30)).toBe(0) // extra field
    expect(zip.readUInt16LE(at + 32)).toBe(0) // comment
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    const crc = zip.readUInt32LE(at + 16)
    const size = zip.readUInt32LE(at + 24)
    expect(zip.readUInt32LE(at + 20), 'compressed size of a stored file').toBe(size)
    const localOffset = zip.readUInt32LE(at + 42)
    expect(localOffset, `${name} follows the previous file`).toBe(expectedLocal)

    expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50)
    expect(zip.readUInt16LE(localOffset + 6)).toBe(zip.readUInt16LE(at + 8)) // flags
    expect(zip.readUInt16LE(localOffset + 8)).toBe(0) // stored
    expect(zip.readUInt32LE(localOffset + 14)).toBe(crc)
    expect(zip.readUInt32LE(localOffset + 18)).toBe(size)
    expect(zip.readUInt32LE(localOffset + 22)).toBe(size)
    expect(zip.readUInt16LE(localOffset + 26)).toBe(nameLength)
    expect(zip.readUInt16LE(localOffset + 28)).toBe(0)
    expect(zip.subarray(localOffset + 30, localOffset + 30 + nameLength).toString('utf8')).toBe(
      name,
    )
    const dataStart = localOffset + 30 + nameLength
    expectedLocal = dataStart + size

    entries.push({
      name,
      flags: zip.readUInt16LE(at + 8),
      method: zip.readUInt16LE(at + 10),
      crc,
      size,
      time: zip.readUInt16LE(at + 12),
      date: zip.readUInt16LE(at + 14),
      madeBy: zip.readUInt16LE(at + 4),
      externalAttributes: zip.readUInt32LE(at + 38),
      data: zip.subarray(dataStart, dataStart + size),
    })
    at += 46 + nameLength
  }
  expect(at, 'the directory has no unread bytes').toBe(end)
  expect(expectedLocal, 'the last file ends where the directory starts').toBe(directoryOffset)
  return entries
}

const build = async (files: ZipFile[], when?: Date) =>
  Buffer.from(await (await createZip(zipEntries(files, when))).arrayBuffer())

describe('zipEntries', () => {
  it('numbers duplicate names without colliding with names already in the batch', () => {
    const blob = new Blob(['image'])
    expect(
      zipEntries([
        { name: 'photo.jpg', blob },
        { name: 'photo (2).jpg', blob },
        { name: 'photo.jpg', blob },
        { name: 'photo.jpg', blob },
      ]).map((entry) => entry.name),
    ).toEqual(['photo.jpg', 'photo (2).jpg', 'photo (3).jpg', 'photo (4).jpg'])
  })

  it('numbers names with no extension, and before the last extension otherwise', () => {
    const blob = new Blob([])
    expect(
      zipEntries([
        { name: 'README', blob },
        { name: 'README', blob },
        { name: 'a.tar.gz', blob },
        { name: 'a.tar.gz', blob },
      ]).map((entry) => entry.name),
    ).toEqual(['README', 'README (2)', 'a.tar.gz', 'a.tar (2).gz'])
  })

  it('never lets a name point to a folder, and never leaves an empty name', () => {
    const blob = new Blob([])
    const names = [
      '../../etc/passwd',
      'C:\\Users\\me\\photo.jpg',
      '/abs.jpg',
      '..',
      '.',
      '',
      'tab\there\n.jpg',
    ]
    expect(zipEntries(names.map((name) => ({ name, blob }))).map((entry) => entry.name)).toEqual([
      '.._.._etc_passwd',
      'C:_Users_me_photo.jpg',
      '_abs.jpg',
      'file',
      'file (2)',
      'file (3)',
      'tab_here_.jpg',
    ])
  })
})

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
    const zip = await createZip(zipEntries([file('x.jpg', bytes(5), 'text/plain')]))
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
    const entry = (blob: Blob) => ({ name: 'x.bin', blob, lastModified: new Date() })
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

    it('rejects a file of 4 GiB or more, which would need ZIP64', async () => {
      const huge = { size: 2 ** 32 } as unknown as Blob
      await expect(createZip([entry(huge)])).rejects.toThrow(RangeError)
    })

    it('rejects more than 65,534 files, and names over 65,535 bytes', async () => {
      const blob = new Blob([])
      const many = Array.from({ length: 0xffff }, () => entry(blob))
      await expect(createZip(many)).rejects.toThrow('Too many files')
      await expect(createZip([{ ...entry(blob), name: 'a'.repeat(0x10000) }])).rejects.toThrow(
        'too long',
      )
    })
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
  const entries = zipEntries(sample())
  const path = join(directory, `${Math.random().toString(36).slice(2)}.zip`)
  writeFileSync(path, Buffer.from(await (await createZip(entries)).arrayBuffer()))
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
