import type { ConvertMeta, EncodableFormat, ImageFormat } from '@mochifile/engine-image'
import { type NavigatorLike, shouldPreloadOnIdle } from '@mochifile/engine-image/preload-policy'
import type { Locale } from '@mochifile/i18n'
import { m } from '@mochifile/i18n/messages'
import { type ToolOptions, validateFiles } from '@mochifile/tool-kit'
import { createToolClient } from '@mochifile/tool-kit/client'
import {
  downloadZip,
  formatSize,
  preloadZip,
  type QueueItem,
  ResultRow,
  errorMessage as sharedErrorMessage,
  useFileQueue,
  usePrepareOnIntent,
} from '@mochifile/tool-ui'
import { Button, Dropzone, Notice, Segmented, Tag } from '@mochifile/ui'
import { useMemo, useState } from 'react'
import { type ConvertImageOptions, manifest, PICKER_EXTENSIONS } from './manifest.ts'

/** One client per page; the worker starts on the first sign of intent, not on page load. */
const client = createToolClient(
  manifest,
  () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
)

const FORMAT_LABEL: Record<ImageFormat, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  heic: 'HEIC',
  avif: 'AVIF',
}
const OUTPUT_FORMATS = ['jpeg', 'png', 'webp'] as const satisfies readonly EncodableFormat[]

// Extensions next to the MIME types: on iOS an `accept` without HEIC makes the picker hand
// over JPEG copies, which would defeat a HEIC converter.
const ACCEPT = [...manifest.accepts, ...PICKER_EXTENSIONS].join(',')

type Item = QueueItem<ConvertImageOptions, ConvertMeta>

interface Props {
  locale: Locale
  /** Options of a variant page, e.g. `{ format: 'png' }`, as untyped plain data. */
  initialOptions?: ToolOptions
}

/** Narrows untyped page options to this tool's options, falling back to the defaults. */
function initialFormat(options: ToolOptions | undefined): EncodableFormat {
  return OUTPUT_FORMATS.find((value) => value === options?.format) ?? manifest.defaults.format
}

export default function ConvertImageUi({ locale, initialOptions }: Props) {
  const initial = useMemo(() => initialFormat(initialOptions), [initialOptions])
  const [format, setFormat] = useState<EncodableFormat>(initial)
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
    ConvertImageOptions,
    ConvertMeta
  >({
    maxFiles: manifest.limits.maxFiles,
    validate: (file) => validateFiles([file], manifest),
    run: async (item, context) => {
      const [result] = await client.run([item.file], item.settings, context)
      if (!result) throw new Error('No result')
      return result
    },
  })

  const addFiles = (files: File[]) => {
    prepare()
    setTooMany(add(files, { format }).tooMany)
  }

  const clearFiles = () => {
    clear()
    setTooMany(false)
  }

  // Files that could not be opened fail the same way in any format, so only the others are
  // offered a second run.
  const retryable = (item: Item) =>
    item.error?.code !== 'unsupported-type' && item.error?.code !== 'file-too-large'
  const stale = items.some(
    (item) =>
      item.status !== 'queued' &&
      item.status !== 'working' &&
      retryable(item) &&
      item.settings.format !== format,
  )

  const downloadAll = async () => {
    await downloadZip(
      done.flatMap((item) =>
        item.result ? [{ name: item.result.name, blob: item.result.blob }] : [],
      ),
      m.convert_image_zip_name({}, { locale }),
    )
  }

  const errorMessage = (item: Item) =>
    sharedErrorMessage(item.error, {
      unsupportedType: () => m.convert_image_error_unsupported({}, { locale }),
      fileTooLarge: () =>
        m.convert_image_error_too_large(
          { maxSize: formatSize(manifest.limits.maxFileSizeBytes, locale) },
          { locale },
        ),
      invalidFile: () => m.convert_image_error_invalid({}, { locale }),
      dimensionsTooLarge: (max) =>
        m.convert_image_error_dimensions({ max: String(max) }, { locale }),
      targetUnreachable: () => m.convert_image_error_generic({}, { locale }),
      generic: () => m.convert_image_error_generic({}, { locale }),
    })

  const stageMessage = (stage: string | undefined) =>
    stage === 'decoding'
      ? m.convert_image_status_decoding({}, { locale })
      : m.convert_image_status_encoding({}, { locale })

  return (
    <div ref={rootRef} className="flex flex-col gap-8" data-engine={engine}>
      {/* Phones: one column. Desktop: the format on the left, the dropzone in the wider column. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-5 lg:items-start lg:gap-8">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Segmented
            legend={m.convert_image_format_legend({}, { locale })}
            value={format}
            onChange={setFormat}
            options={[
              {
                value: 'jpeg',
                label: m.convert_image_format_jpeg({}, { locale }),
                hint: m.convert_image_format_jpeg_hint({}, { locale }),
              },
              {
                value: 'png',
                label: m.convert_image_format_png({}, { locale }),
                hint: m.convert_image_format_png_hint({}, { locale }),
              },
              {
                value: 'webp',
                label: m.convert_image_format_webp({}, { locale }),
                hint: m.convert_image_format_webp_hint({}, { locale }),
              },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 lg:col-span-3">
          <Dropzone
            onFiles={addFiles}
            multiple
            accept={ACCEPT}
            stepLabel={m.convert_image_drop_step({}, { locale })}
            label={m.convert_image_drop_label({}, { locale })}
            hint={m.convert_image_drop_hint(
              {
                maxFiles: String(manifest.limits.maxFiles),
                maxSize: formatSize(manifest.limits.maxFileSizeBytes, locale),
              },
              { locale },
            )}
            pasteHint={m.convert_image_paste_hint({}, { locale })}
          />
          <p className="type-body-sm text-ink-muted">
            {m.convert_image_privacy_note({}, { locale })}
          </p>
          {tooMany && (
            <div role="alert">
              <Notice tone="warning">
                {m.convert_image_too_many(
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
          aria-label={m.convert_image_list_label({}, { locale })}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap gap-3">
            {busy && (
              <Button variant="secondary" onClick={cancel}>
                {m.convert_image_cancel({}, { locale })}
              </Button>
            )}
            {!busy && stale && (
              <Button
                onClick={() =>
                  requeue(new Set(items.filter(retryable).map((item) => item.id)), { format })
                }
              >
                {m.convert_image_rerun({}, { locale })}
              </Button>
            )}
            {done.length > 1 && !busy && (
              <Button onClick={() => void downloadAll()}>
                {m.convert_image_download_all({}, { locale })}
              </Button>
            )}
            <Button variant="secondary" onClick={clearFiles}>
              {m.convert_image_clear({}, { locale })}
            </Button>
          </div>

          <ul className="flex flex-col gap-4">
            {items.map((item, index) => (
              <ResultRow
                key={item.id}
                item={item}
                index={index}
                labels={{
                  waiting: m.convert_image_status_waiting({}, { locale }),
                  cancelled: m.convert_image_cancelled({}, { locale }),
                  download: m.convert_image_download({}, { locale }),
                  downloadNamed: (name) => m.convert_image_download_named({ name }, { locale }),
                  progressLabel: (name) => m.convert_image_progress_label({ name }, { locale }),
                }}
                formatBytes={(bytes) => formatSize(bytes, locale)}
                sizeSummary={(before, after, row) =>
                  m.convert_image_sizes(
                    {
                      before: formatSize(before, locale),
                      from: row.result ? FORMAT_LABEL[row.result.meta.originalFormat] : '',
                      after: formatSize(after, locale),
                      to: row.result ? FORMAT_LABEL[row.result.meta.format] : '',
                    },
                    { locale },
                  )
                }
                stageMessage={stageMessage}
                errorMessage={errorMessage}
                resultDetails={
                  item.result && <ResultDetails meta={item.result.meta} locale={locale} />
                }
                resultActions={
                  item.result?.meta.flattenedTransparency && (
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      disabled={busy}
                      onClick={() => requeue(new Set([item.id]), { format: 'png' })}
                    >
                      {m.convert_image_keep_transparency({}, { locale })}
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

function ResultDetails({ meta, locale }: { meta: ConvertMeta; locale: Locale }) {
  const label = FORMAT_LABEL[meta.format]
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        <li>
          {meta.outcome === 'already-in-format' ? (
            <Tag>{m.convert_image_tag_already({ format: label }, { locale })}</Tag>
          ) : (
            <Tag tone="success">{m.convert_image_tag_converted({ format: label }, { locale })}</Tag>
          )}
        </li>
        <li>
          <Tag tone="success">{m.convert_image_tag_metadata({}, { locale })}</Tag>
        </li>
      </ul>
      {meta.outcome === 'already-in-format' && (
        <Notice tone="info">
          {m.convert_image_already_in_format({ format: label }, { locale })}
        </Notice>
      )}
      {meta.flattenedTransparency && (
        <Notice tone="warning">{m.convert_image_flattened({}, { locale })}</Notice>
      )}
    </>
  )
}
