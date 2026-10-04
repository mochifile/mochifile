import type { CompressMeta, EncodableFormat, OutputFormat } from '@mochifile/engine-image'
import { type NavigatorLike, shouldPreloadOnIdle } from '@mochifile/engine-image/preload-policy'
import type { Locale } from '@mochifile/i18n'
import { m } from '@mochifile/i18n/messages'
import {
  isToolError,
  type ToolErrorCode,
  type ToolErrorDetails,
  type ToolOptions,
  validateFiles,
} from '@mochifile/tool-kit'
import { createToolClient } from '@mochifile/tool-kit/client'
import {
  Button,
  buttonClasses,
  cn,
  Dropzone,
  Mascot,
  Notice,
  ProgressBar,
  Segmented,
  SizeChips,
  Tag,
} from '@mochifile/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type CompressImageOptions, manifest } from './manifest.ts'
import { formatSize, MAX_TARGET, MIN_TARGET, PRESETS, parseTarget, type SizeUnit } from './sizes.ts'

/** One client per page; the worker starts on the first sign of intent, not on page load. */
const client = createToolClient(
  manifest,
  () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
)

const FORMAT_LABEL: Record<EncodableFormat, string> = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' }
const OUTPUT_FORMATS = ['original', 'jpeg', 'webp'] as const satisfies readonly OutputFormat[]

type Status = 'queued' | 'working' | 'done' | 'error' | 'cancelled'

interface Item {
  id: number
  file: File
  status: Status
  /** Settings this file is (or was) compressed with. */
  targetBytes: number
  format: OutputFormat
  progress: number
  stage?: string
  result?: { blob: Blob; url: string; name: string; meta: CompressMeta }
  error?: { code: ToolErrorCode | 'unknown'; details: ToolErrorDetails | undefined }
}

type EngineState = 'idle' | 'loading' | 'ready'

interface Props {
  locale: Locale
  /** Options of a variant page, e.g. `{ targetBytes: 50000 }`, as untyped plain data. */
  initialOptions?: ToolOptions
}

/** Narrows untyped page options to this tool's options, falling back to the defaults. */
function initialSettings(options: ToolOptions | undefined): CompressImageOptions {
  const target = options?.targetBytes
  const format = options?.format
  return {
    targetBytes:
      typeof target === 'number' && target >= MIN_TARGET && target <= MAX_TARGET
        ? target
        : manifest.defaults.targetBytes,
    format: OUTPUT_FORMATS.find((value) => value === format) ?? manifest.defaults.format,
  }
}

let nextId = 1

export default function CompressImageUi({ locale, initialOptions }: Props) {
  const initial = useMemo(() => initialSettings(initialOptions), [initialOptions])
  const initialPreset = PRESETS.find((preset) => preset.bytes === initial.targetBytes)
  const [targetChoice, setTargetChoice] = useState<string>(initialPreset?.key ?? 'custom')
  const [customText, setCustomText] = useState(
    initialPreset ? '' : String(initial.targetBytes / 1000),
  )
  const [customUnit, setCustomUnit] = useState<SizeUnit>('kb')
  const [format, setFormat] = useState<OutputFormat>(initial.format)
  const [engine, setEngine] = useState<EngineState>('idle')
  const [tooMany, setTooMany] = useState(false)
  const [items, setItemsState] = useState<Item[]>([])
  const itemsRef = useRef<Item[]>([])
  const runningRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const zipRef = useRef<Promise<typeof import('client-zip')> | null>(null)

  const setItems = useCallback((update: (items: Item[]) => Item[]) => {
    itemsRef.current = update(itemsRef.current)
    setItemsState(itemsRef.current)
  }, [])
  const patch = useCallback(
    (id: number, changes: Partial<Item>) =>
      setItems((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item))),
    [setItems],
  )

  const preset = PRESETS.find((p) => p.key === targetChoice)
  const custom = targetChoice === 'custom' ? parseTarget(customText, customUnit) : undefined
  const targetBytes = preset ? preset.bytes : custom?.ok ? custom.bytes : undefined

  /**
   * Loads the worker, its WebAssembly codecs and the ZIP helper, so that nothing is fetched
   * after a file is chosen. Runs on the first sign of intent, or when the page is idle.
   */
  const prepare = useCallback(() => {
    if (engine !== 'idle') return
    setEngine('loading')
    zipRef.current ??= import('client-zip')
    client.prepare().then(
      () => setEngine('ready'),
      // A failed preparation (e.g. offline) is retried on the next sign of intent.
      () => setEngine('idle'),
    )
  }, [engine])

  // Any sign of intent on the tool (pointer, keyboard focus, touch, drag) starts loading.
  // Passive listeners: they only observe, so they never delay scrolling or typing.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const events = ['pointerover', 'focusin', 'touchstart', 'dragenter'] as const
    for (const event of events) root.addEventListener(event, prepare, { passive: true })
    return () => {
      for (const event of events) root.removeEventListener(event, prepare)
    }
  }, [prepare])

  useEffect(() => {
    if (!shouldPreloadOnIdle(navigator as NavigatorLike)) return
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(prepare, { timeout: 4000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(prepare, 1500)
    return () => clearTimeout(id)
  }, [prepare])

  // Release every object URL when the component goes away.
  useEffect(
    () => () => {
      for (const item of itemsRef.current) if (item.result) URL.revokeObjectURL(item.result.url)
    },
    [],
  )

  const runQueue = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      for (;;) {
        const next = itemsRef.current.find((item) => item.status === 'queued')
        if (!next) break
        const controller = new AbortController()
        abortRef.current = controller
        patch(next.id, { status: 'working', progress: 0 })
        try {
          const [result] = await client.run(
            [next.file],
            { targetBytes: next.targetBytes, format: next.format },
            {
              signal: controller.signal,
              onProgress: ({ ratio, stage }) =>
                patch(next.id, { progress: ratio, ...(stage ? { stage } : {}) }),
            },
          )
          if (!result) throw new Error('No result')
          patch(next.id, {
            status: 'done',
            result: {
              blob: result.file,
              url: URL.createObjectURL(result.file),
              name: result.name,
              meta: result.meta as unknown as CompressMeta,
            },
          })
        } catch (error) {
          if (isToolError(error) && error.code === 'aborted') {
            patch(next.id, { status: 'cancelled' })
            continue
          }
          patch(next.id, {
            status: 'error',
            error: {
              code: isToolError(error) ? error.code : 'unknown',
              details: isToolError(error) ? error.details : undefined,
            },
          })
        }
      }
    } finally {
      runningRef.current = false
      abortRef.current = null
    }
  }, [patch])

  const addFiles = (files: File[]) => {
    if (targetBytes === undefined) return
    prepare()
    const room = manifest.limits.maxFiles - itemsRef.current.length
    setTooMany(files.length > room)
    const added = files.slice(0, Math.max(0, room)).map((file): Item => {
      const base = { id: nextId++, file, targetBytes, format, progress: 0 }
      try {
        validateFiles([file], manifest)
        return { ...base, status: 'queued' }
      } catch (error) {
        const code = isToolError(error) ? error.code : 'unknown'
        return { ...base, status: 'error', error: { code, details: undefined } }
      }
    })
    setItems((list) => [...list, ...added])
    void runQueue()
  }

  const requeue = (ids: ReadonlySet<number>, changes: Partial<Item>) => {
    setItems((list) =>
      list.map((item) => {
        if (!ids.has(item.id)) return item
        if (item.result) URL.revokeObjectURL(item.result.url)
        const { result: _result, error: _error, stage: _stage, ...rest } = item
        return { ...rest, ...changes, status: 'queued', progress: 0 }
      }),
    )
    void runQueue()
  }

  const cancel = () => {
    setItems((list) =>
      list.map((item) => (item.status === 'queued' ? { ...item, status: 'cancelled' } : item)),
    )
    abortRef.current?.abort()
  }

  const clear = () => {
    abortRef.current?.abort()
    for (const item of itemsRef.current) if (item.result) URL.revokeObjectURL(item.result.url)
    setItems(() => [])
    setTooMany(false)
  }

  const done = items.filter((item) => item.status === 'done')
  const busy = items.some((item) => item.status === 'queued' || item.status === 'working')
  const stale =
    targetBytes !== undefined &&
    items.some(
      (item) =>
        item.status !== 'queued' &&
        item.status !== 'working' &&
        item.error?.code !== 'unsupported-type' &&
        item.error?.code !== 'file-too-large' &&
        (item.targetBytes !== targetBytes || item.format !== format),
    )

  const downloadAll = async () => {
    zipRef.current ??= import('client-zip')
    const { downloadZip } = await zipRef.current
    const used = new Map<string, number>()
    const entries = done.flatMap((item) => {
      if (!item.result) return []
      // Two photos can produce the same name; number the repeats.
      const count = (used.get(item.result.name) ?? 0) + 1
      used.set(item.result.name, count)
      const name =
        count === 1 ? item.result.name : item.result.name.replace(/(\.[^.]*)?$/, ` (${count})$1`)
      return [{ name, input: item.result.blob, lastModified: new Date() }]
    })
    const url = URL.createObjectURL(await downloadZip(entries).blob())
    const link = document.createElement('a')
    link.href = url
    link.download = m.compress_image_zip_name({}, { locale })
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const errorMessage = (item: Item) => {
    const details = item.error?.details
    switch (item.error?.code) {
      case 'unsupported-type':
        return m.compress_image_error_unsupported({}, { locale })
      case 'file-too-large':
        return m.compress_image_error_too_large(
          { maxSize: formatSize(manifest.limits.maxFileSizeBytes, locale) },
          { locale },
        )
      case 'invalid-file':
        return m.compress_image_error_invalid({}, { locale })
      case 'dimensions-too-large':
        return m.compress_image_error_dimensions(
          { max: String(details?.maxMegapixels ?? 100) },
          { locale },
        )
      case 'target-unreachable':
        return m.compress_image_error_unreachable(
          {
            target: formatSize(item.targetBytes, locale),
            smallest: formatSize(Number(details?.smallestBytes ?? 0), locale),
          },
          { locale },
        )
      default:
        return m.compress_image_error_generic({}, { locale })
    }
  }

  const stageMessage = (stage: string | undefined) => {
    if (stage === 'decoding') return m.compress_image_status_decoding({}, { locale })
    if (stage === 'optimising') return m.compress_image_status_optimising({}, { locale })
    return m.compress_image_status_encoding({}, { locale })
  }

  const hasWebp = items.some((item) => item.file.type === 'image/webp')

  return (
    <div ref={rootRef} className="flex flex-col gap-8" data-engine={engine}>
      {/* Phones: one column. Desktop: options on the left, the dropzone in the wider column. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-5 lg:items-start lg:gap-8">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className="flex flex-col gap-3">
            <SizeChips
              legend={m.compress_image_target_legend({}, { locale })}
              value={targetChoice}
              onChange={setTargetChoice}
              // Image tools use the mango block (design system README › Colour).
              block="mango"
              phoneColumns
              options={[
                ...PRESETS.map((p) => ({
                  value: p.key as string,
                  label: formatSize(p.bytes, locale),
                })),
                {
                  value: 'custom',
                  label: m.compress_image_target_custom({}, { locale }),
                  wide: true,
                },
              ]}
            />
            {targetChoice === 'custom' && (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="type-body-sm font-semibold">
                    {m.compress_image_custom_label({}, { locale })}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customText}
                    onChange={(event) => setCustomText(event.currentTarget.value)}
                    aria-invalid={custom?.ok === false && customText !== ''}
                    aria-describedby="compress-image-custom-error"
                    size={6}
                    className="min-h-target-min rounded-md border-chip border-border-control bg-surface-page px-3 focus-ring"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="type-body-sm font-semibold">
                    {m.compress_image_custom_unit_label({}, { locale })}
                  </span>
                  <select
                    value={customUnit}
                    onChange={(event) => setCustomUnit(event.currentTarget.value as SizeUnit)}
                    className="min-h-target-min rounded-md border-chip border-border-control bg-surface-page px-3 focus-ring"
                  >
                    <option value="kb">KB</option>
                    <option value="mb">MB</option>
                  </select>
                </label>
                <p
                  id="compress-image-custom-error"
                  className="basis-full type-body-sm font-semibold text-danger"
                >
                  {custom?.ok === false && customText !== ''
                    ? custom.reason === 'invalid'
                      ? m.compress_image_custom_error_invalid({}, { locale })
                      : m.compress_image_custom_error_range(
                          {
                            min: formatSize(MIN_TARGET, locale),
                            max: formatSize(MAX_TARGET, locale),
                          },
                          { locale },
                        )
                    : ''}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Segmented
              legend={m.compress_image_format_legend({}, { locale })}
              value={format}
              onChange={setFormat}
              options={[
                {
                  value: 'original',
                  label: m.compress_image_format_original({}, { locale }),
                  hint: m.compress_image_format_original_hint({}, { locale }),
                },
                {
                  value: 'jpeg',
                  label: m.compress_image_format_jpeg({}, { locale }),
                  hint: m.compress_image_format_jpeg_hint({}, { locale }),
                },
                {
                  value: 'webp',
                  label: m.compress_image_format_webp({}, { locale }),
                  hint: m.compress_image_format_webp_hint({}, { locale }),
                },
              ]}
            />
            {hasWebp && format !== 'jpeg' && (
              <Notice tone="warning">{m.compress_image_webp_hint({}, { locale })}</Notice>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-3">
          <Dropzone
            onFiles={addFiles}
            multiple
            accept={manifest.accepts.join(',')}
            disabled={targetBytes === undefined}
            stepLabel={m.compress_image_drop_step({}, { locale })}
            label={m.compress_image_drop_label({}, { locale })}
            hint={m.compress_image_drop_hint(
              {
                maxFiles: String(manifest.limits.maxFiles),
                maxSize: formatSize(manifest.limits.maxFileSizeBytes, locale),
              },
              { locale },
            )}
            pasteHint={m.compress_image_paste_hint({}, { locale })}
          />
          <p className="type-body-sm text-ink-muted">
            {m.compress_image_privacy_note({}, { locale })}
          </p>
          {tooMany && (
            <div role="alert">
              <Notice tone="warning">
                {m.compress_image_too_many(
                  { maxFiles: String(manifest.limits.maxFiles) },
                  { locale },
                )}
              </Notice>
            </div>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <section
          aria-label={m.compress_image_list_label({}, { locale })}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap gap-3">
            {busy && (
              <Button variant="secondary" onClick={cancel}>
                {m.compress_image_cancel({}, { locale })}
              </Button>
            )}
            {!busy && stale && (
              <Button
                onClick={() =>
                  requeue(
                    new Set(
                      items
                        .filter(
                          (item) =>
                            item.error?.code !== 'unsupported-type' &&
                            item.error?.code !== 'file-too-large',
                        )
                        .map((item) => item.id),
                    ),
                    targetBytes === undefined ? {} : { targetBytes, format },
                  )
                }
              >
                {m.compress_image_rerun({}, { locale })}
              </Button>
            )}
            {done.length > 1 && !busy && (
              <Button onClick={() => void downloadAll()}>
                {m.compress_image_download_all({}, { locale })}
              </Button>
            )}
            <Button variant="secondary" onClick={clear}>
              {m.compress_image_clear({}, { locale })}
            </Button>
          </div>

          <ul className="flex flex-col gap-4">
            {items.map((item, index) => (
              <li
                key={item.id}
                className={cn(
                  'flex flex-col gap-3 bg-surface-page p-4 sm:p-5',
                  RESULT_SQUISH[index % RESULT_SQUISH.length],
                  item.status === 'done' && 'motion-safe:animate-ready',
                )}
                data-status={item.status}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 break-all type-body-strong">{item.file.name}</span>
                  {/* Result numbers use the display face (type-title-sm). */}
                  <span
                    className={
                      item.result ? 'type-title-sm text-ink' : 'type-body-sm text-ink-muted'
                    }
                  >
                    {item.result
                      ? m.compress_image_sizes(
                          {
                            before: formatSize(item.file.size, locale),
                            after: formatSize(item.result.blob.size, locale),
                          },
                          { locale },
                        )
                      : formatSize(item.file.size, locale)}
                  </span>
                </div>
                <div aria-live="polite" className="flex flex-col gap-3">
                  {item.status === 'queued' && (
                    <span className="type-body-sm text-ink-muted">
                      {m.compress_image_status_waiting({}, { locale })}
                    </span>
                  )}
                  {item.status === 'working' && (
                    <div className="flex items-center gap-3">
                      <Mascot state="squish" className="w-14" />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className="type-body-sm">{stageMessage(item.stage)}</span>
                        <ProgressBar
                          value={item.progress}
                          label={m.compress_image_progress_label(
                            { name: item.file.name },
                            { locale },
                          )}
                        />
                      </div>
                    </div>
                  )}
                  {item.status === 'cancelled' && (
                    <span className="type-body-sm text-ink-muted">
                      {m.compress_image_cancelled({}, { locale })}
                    </span>
                  )}
                  {item.status === 'error' && (
                    <div role="alert">
                      <Notice tone="danger">{errorMessage(item)}</Notice>
                    </div>
                  )}
                  {item.status === 'done' && item.result && (
                    <ResultDetails item={item} result={item.result} locale={locale} />
                  )}
                </div>
                {item.status === 'done' && item.result && (
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={item.result.url}
                      download={item.result.name}
                      aria-label={m.compress_image_download_named(
                        { name: item.result.name },
                        { locale },
                      )}
                      className={buttonClasses('primary', 'w-full sm:w-auto')}
                    >
                      <DownloadIcon />
                      {m.compress_image_download({}, { locale })}
                    </a>
                    {item.result.meta.flattenedTransparency && (
                      <Button
                        variant="secondary"
                        className="w-full sm:w-auto"
                        disabled={busy}
                        onClick={() => requeue(new Set([item.id]), { format: 'webp' })}
                      >
                        {m.compress_image_keep_transparency({}, { locale })}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Result cards vary their squished corners so a list does not look stamped. */
const RESULT_SQUISH = ['rounded-lg-squish-a', 'rounded-lg-squish-b', 'rounded-lg-squish-c'] as const

/** Download arrow (README › Iconography: 24 px grid, 2 px stroke, round caps). */
function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-button-icon fill-none stroke-current stroke-2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
    </svg>
  )
}

function ResultDetails({
  item,
  result,
  locale,
}: {
  item: Item
  result: NonNullable<Item['result']>
  locale: Locale
}) {
  const { meta } = result
  const size = (width: number, height: number) => `${width} × ${height}`
  return (
    <>
      {meta.outcome === 'already-under' ? (
        <Notice tone="success">
          {m.compress_image_already_under(
            { target: formatSize(item.targetBytes, locale) },
            { locale },
          )}
        </Notice>
      ) : (
        <Notice tone="success">
          {m.compress_image_result_under(
            { target: formatSize(item.targetBytes, locale) },
            { locale },
          )}
        </Notice>
      )}
      <ul className="flex flex-wrap gap-2">
        <li>
          <Tag tone="success">{m.compress_image_tag_metadata({}, { locale })}</Tag>
        </li>
        {meta.converted && item.format === 'original' && (
          <li>
            <Tag>
              {m.compress_image_converted({ format: FORMAT_LABEL[meta.format] }, { locale })}
            </Tag>
          </li>
        )}
        {meta.resized && (
          <li>
            <Tag tone="warning">
              {m.compress_image_resized(
                {
                  from: size(meta.originalWidth, meta.originalHeight),
                  to: size(meta.width, meta.height),
                },
                { locale },
              )}
            </Tag>
          </li>
        )}
      </ul>
      {meta.flattenedTransparency && (
        <Notice tone="warning">{m.compress_image_flattened({}, { locale })}</Notice>
      )}
    </>
  )
}
