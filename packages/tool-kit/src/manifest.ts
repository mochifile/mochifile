import { locales } from '@mochifile/i18n'
import {
  type ToolLocaleMeta,
  type ToolManifest,
  type ToolOptions,
  toolCategories,
  toolRuntimes,
} from './contract.ts'

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MIME = /^[a-z]+\/(?:\*|[a-z0-9][a-z0-9.+-]*)$/
export const TITLE_MAX = 70
export const DESCRIPTION_MAX = 160
/** Short enough for about two lines on a phone, so the tool stays above the fold. */
export const TAGLINE_MAX = 60
export const RELATED_PAGES_LABEL_MAX = 40
/** Content key of a tool's main page; variants may not use it. */
export const MAIN_PAGE_KEY = 'index'

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
  problems.push(...validateMeta(manifest.meta, 'meta'))
  try {
    structuredClone(manifest.defaults)
  } catch {
    problems.push('defaults must be structured-cloneable plain data')
  }
  if (manifest.relatedPagesLabel) {
    for (const locale of locales) {
      const label = manifest.relatedPagesLabel[locale]
      if (!label?.trim()) problems.push(`relatedPagesLabel.${locale} is empty`)
      else if (label.length > RELATED_PAGES_LABEL_MAX) {
        problems.push(`relatedPagesLabel.${locale} exceeds ${RELATED_PAGES_LABEL_MAX} chars`)
      }
    }
  }
  const keys = new Set<string>()
  for (const [index, variant] of (manifest.variants ?? []).entries()) {
    const at = `variants[${index}]`
    if (!KEBAB.test(variant.key)) problems.push(`${at}.key must be lowercase kebab-case`)
    if (variant.key === MAIN_PAGE_KEY) problems.push(`${at}.key "${MAIN_PAGE_KEY}" is reserved`)
    if (keys.has(variant.key)) problems.push(`${at}.key "${variant.key}" is used twice`)
    keys.add(variant.key)
    for (const option of Object.keys(variant.options)) {
      if (!Object.hasOwn(manifest.defaults, option)) {
        problems.push(`${at}.options.${option} is not in defaults`)
      }
    }
    try {
      structuredClone(variant.options)
    } catch {
      problems.push(`${at}.options must be structured-cloneable plain data`)
    }
    problems.push(...validateMeta(variant.meta, `${at}.meta`))
  }
  return problems
}

function validateMeta(meta: Partial<Record<string, ToolLocaleMeta>>, at: string): string[] {
  const problems: string[] = []
  for (const locale of locales) {
    const entry = meta[locale]
    if (!entry) {
      problems.push(`missing ${at} for locale "${locale}"`)
      continue
    }
    if (!KEBAB.test(entry.slug)) problems.push(`${at}.${locale}.slug must be lowercase kebab-case`)
    if (!entry.title.trim()) problems.push(`${at}.${locale}.title is empty`)
    if (entry.title.length > TITLE_MAX) {
      problems.push(`${at}.${locale}.title exceeds ${TITLE_MAX} chars`)
    }
    if (!entry.description.trim()) problems.push(`${at}.${locale}.description is empty`)
    if (entry.description.length > DESCRIPTION_MAX) {
      problems.push(`${at}.${locale}.description exceeds ${DESCRIPTION_MAX} chars`)
    }
    if (!entry.tagline.trim()) problems.push(`${at}.${locale}.tagline is empty`)
    if (entry.tagline.length > TAGLINE_MAX) {
      problems.push(`${at}.${locale}.tagline exceeds ${TAGLINE_MAX} chars`)
    }
  }
  return problems
}

/**
 * Throws if two manifests share an id, or if any two pages (main pages and variants, across
 * all tools) share a slug within the same locale.
 */
export function assertUniqueTools(manifests: readonly ToolManifest[]): void {
  const ids = new Set<string>()
  const slugs = new Map<string, string>()
  for (const manifest of manifests) {
    if (ids.has(manifest.id)) throw new Error(`Duplicate tool id "${manifest.id}"`)
    ids.add(manifest.id)
    const pages = [
      { name: manifest.id, meta: manifest.meta },
      ...(manifest.variants ?? []).map((variant) => ({
        name: `${manifest.id}/${variant.key}`,
        meta: variant.meta,
      })),
    ]
    for (const page of pages) {
      for (const locale of locales) {
        const key = `${locale}:${page.meta[locale].slug}`
        const owner = slugs.get(key)
        if (owner) throw new Error(`Slug "${key}" used by both "${owner}" and "${page.name}"`)
        slugs.set(key, page.name)
      }
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
