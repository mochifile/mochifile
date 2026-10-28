/**
 * The mascot illustrations (`assets/illustrations`), the 2026-10 collection: sheets (`sheet-*`,
 * wide scenes on a colour block), expressions (`expr-*`, a face on a tinted tile) and category
 * art (`use-*`). Each file is `<name>-<width>.webp`, made from a 1.3-1.6 k px original and not
 * sharpened (docs/design-system/assets/illustrations.md). Sheets and category art come at 720 px
 * (1x) and 1440 px (2x); expressions at 288 px, three times their largest box (96 px).
 *
 * `illustration()` returns what an `<img>` needs: a `srcset` with every width on disk, so adding
 * or regenerating a file never needs a component to change, and the file's own `width` and
 * `height`, which reserve the box (CSS sets the shown size) so nothing shifts when it arrives.
 */
const files = import.meta.glob<ImageMetadata>('../assets/illustrations/*.webp', {
  eager: true,
  import: 'default',
})

/** What an `<img>` needs; a single-file illustration has no `srcset`. */
export interface IllustrationAttributes {
  src: string
  width: number
  height: number
  srcset?: string
  sizes?: string
}

interface Candidate {
  width: number
  image: ImageMetadata
}

const byName = new Map<string, Candidate[]>()
for (const [path, image] of Object.entries(files)) {
  const match = /\/([a-z0-9-]+?)-(\d+)\.webp$/.exec(path)
  const name = match?.[1]
  if (!name) continue
  const list = byName.get(name) ?? []
  list.push({ width: image.width, image })
  byName.set(
    name,
    list.sort((a, b) => a.width - b.width),
  )
}

/**
 * The attributes for an illustration. `sizes` says how wide it is shown, so the browser picks the
 * smallest file that is sharp on the screen; leave it out for a single-file expression, which is
 * shown at a fixed small size.
 */
export function illustration(name: string, sizes?: string): IllustrationAttributes {
  const list = byName.get(name)
  const first = list?.[0]
  if (!list || !first) throw new Error(`No illustration named "${name}" in assets/illustrations`)
  const base = {
    src: first.image.src,
    width: first.image.width,
    height: first.image.height,
  }
  if (list.length === 1) return base
  return {
    ...base,
    srcset: list.map(({ width, image }) => `${image.src} ${width}w`).join(', '),
    sizes: sizes ?? '100vw',
  }
}
