/**
 * "Download all" as one ZIP file, built in the browser with `client-zip` (no upload, no server).
 * The library loads on the first sign of intent (`preloadZip`), so nothing is fetched after
 * files are chosen.
 */
let zipModule: Promise<typeof import('client-zip')> | undefined

function loadZip(): Promise<typeof import('client-zip')> {
  if (!zipModule) {
    const loading = import('client-zip')
    zipModule = loading
    // Forget a failed load (e.g. offline) so a later call can retry.
    loading.catch(() => {
      if (zipModule === loading) zipModule = undefined
    })
  }
  return zipModule
}

/** Starts loading the ZIP library; call it when the tool prepares. */
export function preloadZip(): void {
  loadZip().catch(() => {})
}

/** ZIP entries for `files`, numbering repeated names: `a.jpg`, `a (2).jpg`, `a (3).jpg`. */
export function zipEntries(files: ReadonlyArray<{ name: string; blob: Blob }>) {
  const counts = new Map<string, number>()
  const used = new Set<string>()
  return files.map(({ name, blob }) => {
    // A generated suffix may already be another file's name, so keep looking for a free one.
    let count = (counts.get(name) ?? 0) + 1
    let unique = count === 1 ? name : name.replace(/(\.[^.]*)?$/, ` (${count})$1`)
    while (used.has(unique)) {
      count += 1
      unique = name.replace(/(\.[^.]*)?$/, ` (${count})$1`)
    }
    counts.set(name, count)
    used.add(unique)
    return { name: unique, input: blob, lastModified: new Date() }
  })
}

/** Builds the ZIP and starts its download as `zipName`. */
export async function downloadZip(
  files: ReadonlyArray<{ name: string; blob: Blob }>,
  zipName: string,
): Promise<void> {
  const { downloadZip: zip } = await loadZip()
  const url = URL.createObjectURL(await zip(zipEntries(files)).blob())
  const link = document.createElement('a')
  link.href = url
  link.download = zipName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
