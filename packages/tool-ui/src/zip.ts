/**
 * "Download all" as one ZIP file, built in the browser (no upload, no server). The builder
 * (`zip-archive.ts`: names, CRC-32 and headers) loads on the first sign of intent (`preloadZip`),
 * as the library it replaced did: the tool's first load does not carry it, and nothing is fetched
 * after files are chosen. Statically importing it from here would put it in that first load.
 */
import type { ZipFile } from './zip-archive.ts'

export type { ZipEntry, ZipFile } from './zip-archive.ts'

let archive: Promise<typeof import('./zip-archive.ts')> | undefined

function loadArchive(): Promise<typeof import('./zip-archive.ts')> {
  if (!archive) {
    const loading = import('./zip-archive.ts')
    archive = loading
    // Forget a failed load (e.g. offline) so a later call can retry.
    loading.catch(() => {
      if (archive === loading) archive = undefined
    })
  }
  return archive
}

/** Starts loading the ZIP builder; call it when the tool prepares. */
export function preloadZip(): void {
  loadArchive().catch(() => {})
}

/**
 * Why "Download all" failed, in terms of what a person can do about it, never the internals:
 * - `load`: the builder could not be loaded. Some browsers fetch it again on the next try
 *   (WebKit does); others keep the failure for the life of the page (Chromium does), and then
 *   only a reload helps;
 * - `too-large`: the files do not fit one ZIP (see `zip-archive.ts`); trying again cannot help;
 * - `failed`: anything else: a file that could not be read, the archive, the browser refusing the
 *   download. Trying again may help.
 */
export type ZipFailure = 'load' | 'too-large' | 'failed'

/** What `downloadZip` rejects with. The message says nothing about files, names or modules. */
export class ZipError extends Error {
  readonly reason: ZipFailure

  constructor(reason: ZipFailure, options?: ErrorOptions) {
    super(`The ZIP could not be made (${reason})`, options)
    this.name = 'ZipError'
    this.reason = reason
  }
}

/**
 * Builds the ZIP and starts its download as `zipName`. Rejects with a `ZipError`, and then nothing
 * was downloaded and no object URL is left behind. Whether the browser saved the file is up to it.
 */
export async function downloadZip(files: ReadonlyArray<ZipFile>, zipName: string): Promise<void> {
  let createZip: typeof import('./zip-archive.ts').createZip
  try {
    ;({ createZip } = await loadArchive())
  } catch (cause) {
    throw new ZipError('load', { cause })
  }
  let zip: Blob
  try {
    zip = await createZip(files)
  } catch (cause) {
    // The builder throws a RangeError for what the format cannot hold, and so does the browser
    // when it cannot allocate: both mean "too big", and neither gets better by trying again.
    throw new ZipError(cause instanceof RangeError ? 'too-large' : 'failed', { cause })
  }
  let url: string | undefined
  try {
    url = URL.createObjectURL(zip)
    const link = document.createElement('a')
    link.href = url
    link.download = zipName
    link.click()
  } catch (cause) {
    if (url !== undefined) URL.revokeObjectURL(url)
    throw new ZipError('failed', { cause })
  }
  const started = url
  setTimeout(() => URL.revokeObjectURL(started), 60_000)
}
