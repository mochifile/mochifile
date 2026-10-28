// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { bytes, file } from './testing/zip-testing.ts'
import { createZip, zipEntries } from './zip-archive.ts'

/**
 * The real thing: ZIPs whose files would overwrite each other if their names were kept are
 * extracted by the programs people use, and every file must come out, whole. On macOS the volume
 * is case-insensitive and insensitive to Unicode normalization by default, which is where the loss
 * used to happen; on a case-sensitive one (most Linux) these checks still hold, they just could not
 * have failed for the case and accent cases.
 */
const hasTool = (command: string) =>
  (spawnSync(command, ['--version']).error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT'

const root = mkdtempSync(join(tmpdir(), 'mochifile-extract-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** Names that are the same file for case, for folder rules and for Windows, all in ASCII. */
const ASCII_NAMES = [
  'Photo.JPG',
  'photo.jpg',
  'PHOTO.jpg',
  'a/b.jpg',
  'a_b.jpg',
  'a\\b.jpg',
  'a:b.jpg',
  'CON.txt',
  'con.txt',
  'NUL',
  'report.',
  'report',
  'x: y?.jpg',
  '/abs.jpg',
  '../../escape.jpg',
  '..',
  '',
  `${'long'.repeat(80)}.jpg`,
  `${'long'.repeat(80)}.jpg`,
]
/** What is the same for Unicode normalization and case tables, and what is not valid UTF-16. */
const UNICODE_NAMES = [
  'café.jpg',
  'café.jpg',
  'Å.png',
  'Å.png',
  'Å.png',
  'ß.jpg',
  'SS.jpg',
  'σ.jpg',
  'ς.jpg',
  'Σ.jpg',
  'a\ud800.jpg',
  'a\udc00.jpg',
  '写真.png',
  '🍡.webp',
]

const sha256 = (data: Uint8Array | Buffer) => createHash('sha256').update(data).digest('hex')

/** The regular files under `dir`, as `[relative path, content hash]`. */
function filesUnder(dir: string): Array<[string, string]> {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name)
      return [path.slice(dir.length + 1), sha256(readFileSync(path))] as [string, string]
    })
}

const extractors: Record<string, [command: string, args: (zip: string, to: string) => string[]]> = {
  unzip: ['unzip', (zip, to) => ['-q', zip, '-d', to]],
  // What macOS's own Archive Utility uses.
  ditto: ['ditto', (zip, to) => ['-x', '-k', zip, to]],
  bsdtar: ['bsdtar', (zip, to) => ['-xf', zip, '-C', to]],
  python: [
    'python3',
    (zip, to) => [
      '-I',
      '-c',
      'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',
      zip,
      to,
    ],
  ],
}

async function extractWith(tool: string, names: string[]) {
  const [command, args] = extractors[tool] as (typeof extractors)[string]
  const folder = mkdtempSync(join(root, `${tool}-`))
  const target = join(folder, 'out')
  mkdirSync(target)
  const files = names.map((name, i) => file(name, bytes(300 + i * 101, i + 7), 'image/jpeg'))
  const zipPath = join(folder, 'in.zip')
  writeFileSync(zipPath, Buffer.from(await (await createZip(files)).arrayBuffer()))
  const run = spawnSync(command, args(zipPath, target), { encoding: 'utf8' })
  const expected = new Map<string, string>()
  for (const [i, entry] of zipEntries(files).entries()) {
    expected.set(
      sha256(Buffer.from(await (files[i]?.blob.arrayBuffer() as Promise<ArrayBuffer>))),
      entry.name,
    )
  }
  return { run, target, folder, expected, count: files.length }
}

function expectEverythingExtracted(result: Awaited<ReturnType<typeof extractWith>>) {
  const { run, target, folder, expected, count } = result
  expect(run.status, `${run.stdout}${run.stderr}`).toBe(0)
  const extracted = filesUnder(target)
  // Every file is a file of its own, directly in the folder: no overwritten ones, no folders.
  expect(extracted, 'one file on disk per entry').toHaveLength(count)
  expect(extracted.every(([path]) => !path.includes('/'))).toBe(true)
  // And it is the file that was given: same bytes, under the name the archive says.
  expect(new Set(extracted.map(([, hash]) => hash))).toEqual(new Set(expected.keys()))
  for (const [path, hash] of extracted) {
    expect(path.normalize('NFC'), 'the name is the one in the archive').toBe(
      expected.get(hash)?.normalize('NFC'),
    )
  }
  // Nothing was written next to the folder (`../../escape.jpg` and `/abs.jpg` stay inside it).
  expect(readdirSync(folder).sort()).toEqual(['in.zip', 'out'])
}

describe.each(Object.keys(extractors))('extracting with %s', (tool) => {
  const [command] = extractors[tool] as (typeof extractors)[string]

  it.skipIf(!hasTool(command))(
    'keeps every file whose name is the same as another for case, folders or Windows',
    async () => {
      expectEverythingExtracted(await extractWith(tool, ASCII_NAMES))
    },
  )

  // Info-ZIP's unzip and libarchive mangle non-ASCII names in a locale that is not UTF-8 (as in
  // most CI containers), which is a fault of how they are run here and would be mistaken for ours.
  it.skipIf(!hasTool(command) || tool === 'unzip' || tool === 'bsdtar')(
    'keeps every file whose name is the same as another for Unicode',
    async () => {
      expectEverythingExtracted(await extractWith(tool, [...ASCII_NAMES, ...UNICODE_NAMES]))
    },
  )
})
