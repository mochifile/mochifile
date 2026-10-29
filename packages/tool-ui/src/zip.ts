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

/** Builds the ZIP and starts its download as `zipName`. Nothing is downloaded if it fails. */
export async function downloadZip(files: ReadonlyArray<ZipFile>, zipName: string): Promise<void> {
  const { createZip } = await loadArchive()
  const url = URL.createObjectURL(await createZip(files))
  const link = document.createElement('a')
  link.href = url
  link.download = zipName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
