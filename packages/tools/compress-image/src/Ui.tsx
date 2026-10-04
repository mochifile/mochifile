import type { CompressMeta, EncodableFormat, OutputFormat } from '@mochifile/engine-image'
import { type NavigatorLike, shouldPreloadOnIdle } from '@mochifile/engine-image/preload-policy'
import type { Locale } from '@mochifile/i18n'
import { m } from '@mochifile/i18n/messages'
import { type ToolOptions, validateFiles } from '@mochifile/tool-kit'
import { createToolClient } from '@mochifile/tool-kit/client'
import {
  downloadZip,
  preloadZip,
  type QueueItem,
  ResultRow,
  errorMessage as sharedErrorMessage,
  useFileQueue,
  usePrepareOnIntent,
} from '@mochifile/tool-ui'
import { Button, Dropzone, Notice, Segmented, SizeChips, Tag } from '@mochifile/ui'
import { useMemo, useState } from 'react'
import { type CompressImageOptions, manifest } from './manifest.ts'
import { formatSize, MAX_TARGET, MIN_TARGET, PRESETS, parseTarget, type SizeUnit } from './sizes.ts'

/** One client per page; the worker starts on the first sign of intent, not on page load. */
const client = createToolClient(
  manifest,
  () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
)

const FORMAT_LABEL: Record<EncodableFormat, string> = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' }
const OUTPUT_FORMATS = ['original', 'jpeg', 'webp'] as const satisfies readonly OutputFormat[]

type Item = QueueItem<CompressImageOptions, CompressMeta>

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

export default function CompressImageUi({ locale, initialOptions }: Props) {
  const initial = useMemo(() => initialSettings(initialOptions), [initialOptions])
  const initialPreset = PRESETS.find((preset) => preset.bytes === initial.targetBytes)
  const [targetChoice, setTargetChoice] = useState<string>(initialPreset?.key ?? 'custom')
  const [customText, setCustomText] = useState(
    initialPreset ? '' : String(initial.targetBytes / 1000),
  )
  const [customUnit, setCustomUnit] = useState<SizeUnit>('kb')
  const [format, setFormat] = useState<OutputFormat>(initial.format)
  const [tooMany, setTooMany] = useState(false)
  const {
    rootRef,
    state: engine,
    prepare,
  } = usePrepareOnIntent({
    load: () => {
      preloadZip()
      return client.prepare()
    },
    preloadOnIdle: () => shouldPreloadOnIdle(navigator as NavigatorLike),
  })
  const { items, add, requeue, cancel, clear, done, busy } = useFileQueue<
    CompressImageOptions,
    CompressMeta
  >({
    maxFiles: manifest.limits.maxFiles,
    validate: (file) => validateFiles([file], manifest),
    run: async (item, context) => {
      const [result] = await client.run([item.file], item.settings, context)
      if (!result) throw new Error('No result')
      return result
    },
  })

  const preset = PRESETS.find((p) => p.key === targetChoice)
  const custom = targetChoice === 'custom' ? parseTarget(customText, customUnit) : undefined
  const targetBytes = preset ? preset.bytes : custom?.ok ? custom.bytes : undefined

  const addFiles = (files: File[]) => {
    if (targetBytes === undefined) return
    prepare()
    setTooMany(add(files, { targetBytes, format }).tooMany)
  }

  const clearFiles = () => {
    clear()
    setTooMany(false)
  }
  const stale =
    targetBytes !== undefined &&
    items.some(
      (item) =>
        item.status !== 'queued' &&
        item.status !== 'working' &&
        item.error?.code !== 'unsupported-type' &&
        item.error?.code !== 'file-too-large' &&
        (item.settings.targetBytes !== targetBytes || item.settings.format !== format),
    )

  const downloadAll = async () => {
    await downloadZip(
      done.flatMap((item) =>
        item.result ? [{ name: item.result.name, blob: item.result.blob }] : [],
      ),
      m.compress_image_zip_name({}, { locale }),
    )
  }

  const errorMessage = (item: Item) =>
    sharedErrorMessage(item.error, {
      unsupportedType: () => m.compress_image_error_unsupported({}, { locale }),
      fileTooLarge: () =>
        m.compress_image_error_too_large(
          { maxSize: formatSize(manifest.limits.maxFileSizeBytes, locale) },
          { locale },
        ),
      invalidFile: () => m.compress_image_error_invalid({}, { locale }),
      dimensionsTooLarge: (max) =>
        m.compress_image_error_dimensions({ max: String(max) }, { locale }),
      targetUnreachable: (smallest) =>
        m.compress_image_error_unreachable(
          {
            target: formatSize(item.settings.targetBytes, locale),
            smallest: formatSize(smallest, locale),
          },
          { locale },
        ),
      generic: () => m.compress_image_error_generic({}, { locale }),
    })

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
            <Button variant="secondary" onClick={clearFiles}>
              {m.compress_image_clear({}, { locale })}
            </Button>
          </div>

          <ul className="flex flex-col gap-4">
            {items.map((item, index) => (
              <ResultRow
                key={item.id}
                item={item}
                index={index}
                labels={{
                  waiting: m.compress_image_status_waiting({}, { locale }),
                  cancelled: m.compress_image_cancelled({}, { locale }),
                  download: m.compress_image_download({}, { locale }),
                  downloadNamed: (name) => m.compress_image_download_named({ name }, { locale }),
                  progressLabel: (name) => m.compress_image_progress_label({ name }, { locale }),
                }}
                formatBytes={(bytes) => formatSize(bytes, locale)}
                sizeSummary={(before, after) =>
                  m.compress_image_sizes(
                    { before: formatSize(before, locale), after: formatSize(after, locale) },
                    { locale },
                  )
                }
                stageMessage={stageMessage}
                errorMessage={errorMessage}
                resultDetails={
                  item.result && <ResultDetails item={item} result={item.result} locale={locale} />
                }
                resultActions={
                  item.result?.meta.flattenedTransparency && (
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      disabled={busy}
                      onClick={() => requeue(new Set([item.id]), { format: 'webp' })}
                    >
                      {m.compress_image_keep_transparency({}, { locale })}
                    </Button>
                  )
                }
              />
            ))}
          </ul>
        </section>
      )}
    </div>
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
            { target: formatSize(item.settings.targetBytes, locale) },
            { locale },
          )}
        </Notice>
      ) : (
        <Notice tone="success">
          {m.compress_image_result_under(
            { target: formatSize(item.settings.targetBytes, locale) },
            { locale },
          )}
        </Notice>
      )}
      <ul className="flex flex-wrap gap-2">
        <li>
          <Tag tone="success">{m.compress_image_tag_metadata({}, { locale })}</Tag>
        </li>
        {meta.converted && item.settings.format === 'original' && (
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
