import { locales } from '@mochifile/i18n'
import { type ToolManifest, type ToolOptions, toolCategories, toolRuntimes } from './contract.ts'

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MIME = /^[a-z]+\/(?:\*|[a-z0-9][a-z0-9.+-]*)$/
export const TITLE_MAX = 70
export const DESCRIPTION_MAX = 160

/**
 * Declares a tool manifest. Validates it eagerly so mistakes fail at build and test time,
 * and returns a deeply frozen copy.
 */
export function defineToolManifest<O extends ToolOptions>(
  manifest: ToolManifest<O>,
): ToolManifest<O> {
  const problems = validateManifest(manifest)
  if (problems.length > 0) {
    throw new Error(`Invalid tool manifest "${manifest.id}":\n- ${problems.join('\n- ')}`)
  }
  return deepFreeze(structuredClone(manifest))
}

export function validateManifest(manifest: ToolManifest): string[] {
  const problems: string[] = []
  if (!KEBAB.test(manifest.id)) problems.push('id must be lowercase kebab-case')
  if (!toolCategories.includes(manifest.category)) problems.push('unknown category')
  if (!toolRuntimes.includes(manifest.runtime)) problems.push('unknown runtime')
  if (manifest.accepts.length === 0) problems.push('accepts must list at least one MIME type')
  for (const type of manifest.accepts) {
    if (!MIME.test(type)) problems.push(`invalid MIME type "${type}"`)
  }
  const { maxFiles, maxFileSizeBytes, maxTotalSizeBytes } = manifest.limits
  if (!Number.isInteger(maxFiles) || maxFiles < 1) problems.push('limits.maxFiles must be >= 1')
  if (!(maxFileSizeBytes > 0)) problems.push('limits.maxFileSizeBytes must be > 0')
  if (maxTotalSizeBytes !== undefined && !(maxTotalSizeBytes >= maxFileSizeBytes)) {
    problems.push('limits.maxTotalSizeBytes must be >= maxFileSizeBytes')
  }
  for (const locale of locales) {
    const meta = manifest.meta[locale]
    if (!meta) {
      problems.push(`missing meta for locale "${locale}"`)
      continue
    }
    if (!KEBAB.test(meta.slug)) problems.push(`meta.${locale}.slug must be lowercase kebab-case`)
    if (!meta.title.trim()) problems.push(`meta.${locale}.title is empty`)
    if (meta.title.length > TITLE_MAX)
      problems.push(`meta.${locale}.title exceeds ${TITLE_MAX} chars`)
    if (!meta.description.trim()) problems.push(`meta.${locale}.description is empty`)
    if (meta.description.length > DESCRIPTION_MAX) {
      problems.push(`meta.${locale}.description exceeds ${DESCRIPTION_MAX} chars`)
    }
  }
  try {
    structuredClone(manifest.defaults)
  } catch {
    problems.push('defaults must be structured-cloneable plain data')
  }
  return problems
}

/** Throws if two manifests share an id, or a slug within the same locale. */
export function assertUniqueTools(manifests: readonly ToolManifest[]): void {
  const ids = new Set<string>()
  const slugs = new Map<string, string>()
  for (const manifest of manifests) {
    if (ids.has(manifest.id)) throw new Error(`Duplicate tool id "${manifest.id}"`)
    ids.add(manifest.id)
    for (const locale of locales) {
      const key = `${locale}:${manifest.meta[locale].slug}`
      const owner = slugs.get(key)
      if (owner) throw new Error(`Slug "${key}" used by both "${owner}" and "${manifest.id}"`)
      slugs.set(key, manifest.id)
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
