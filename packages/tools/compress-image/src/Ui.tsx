import type { CompressMeta, EncodableFormat, OutputFormat } from '@mochifile/engine-image'
import { type NavigatorLike, shouldPreloadOnIdle } from '@mochifile/engine-image/preload-policy'
import type { Locale } from '@mochifile/i18n'
import { m } from '@mochifile/i18n/messages'
import { type ToolOptions, validateFiles } from '@mochifile/tool-kit'
import { createToolClient } from '@mochifile/tool-kit/client'
import {
  downloadZip,
  FileName,
  preloadZip,
  type QueueItem,
  errorMessage as sharedErrorMessage,
  summarizeQueue,
  useFileQueue,
  usePrepareOnIntent,
  ZipError,
  type ZipFailure,
} from '@mochifile/tool-ui'
import { type DragEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import celebrate from './assets/expr-celebrate-288.webp'
import determined from './assets/expr-determined-288.webp'
import excited from './assets/expr-excited-288.webp'
import normal from './assets/expr-normal-288.webp'
import sad from './assets/expr-sad-288.webp'
import smiling from './assets/expr-smiling-288.webp'
import squishing from './assets/expr-squishing-288.webp'
import { type CompressImageOptions, manifest } from './manifest.ts'
import './panel.css'
import { formatSize, MAX_TARGET, MIN_TARGET, PRESETS, parseTarget, type SizeUnit } from './sizes.ts'

/** One client per page; the worker starts on the first sign of intent, not on page load. */
const client = createToolClient(
  manifest,
  () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
)

const FORMAT_LABEL: Record<EncodableFormat, string> = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' }
const OUTPUT_FORMATS = ['original', 'jpeg', 'webp'] as const satisfies readonly OutputFormat[]

/** How many rows a list shows before it is staged ("+ 18 more photos"). */
const STAGED_ROWS = 5

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

/** What the tool needs from the browser: a worker, WebAssembly and object URLs. */
function browserCanRun(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof WebAssembly !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof File !== 'undefined'
  )
}

/** An imported picture: its URL and pixel size, so the box is reserved before it loads. */
type Picture = { src: string; width: number; height: number }

type Tone = 'plain' | 'working' | 'ready' | 'attention' | 'cancelled'

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
  // Photos are listed first and compressed when the person says so ("Compress 3 photos").
  const [started, setStarted] = useState(false)
  const [dragging, setDragging] = useState(false)
  const runnable = useMemo(browserCanRun, [])

  // The mascots the panel shows later are fetched now, so nothing is requested once photos have
  // been chosen (the same rule as the compressor's code). Not on Save-Data.
  useEffect(() => {
    const connection = (navigator as { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) return
    for (const picture of [determined, squishing, celebrate, smiling, sad, excited]) {
      new Image().src = picture.src
    }
  }, [])
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
  const { items, add, requeue, cancel, remove, clear, done, busy } = useFileQueue<
    CompressImageOptions,
    CompressMeta
  >({
    // Files wait until the compressor has loaded and the person has started, so none fails only
    // because the code is missing, and nothing is fetched after a file is chosen.
    paused: engine !== 'ready' || !started,
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
  const customInvalid = custom?.ok === false && customText !== ''

  const addFiles = (files: File[]) => {
    if (targetBytes === undefined || files.length === 0) return
    prepare()
    setTooMany(add(files, { targetBytes, format }).tooMany)
  }

  const clearFiles = () => {
    clear()
    setStarted(false)
    setTooMany(false)
  }

  // Focus goes where the person can carry on, never to <body>: to the next file's remove button
  // after a removal, to "Choose photos" after the list is cleared or once the compressor loads
  // after "Try again", to the size chosen after "Choose another size", and to what comes first
  // (Cancel, else the result's actions) once the photos are on their way.
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  useEffect(() => {
    if (focusTarget === null) return
    const target = rootRef.current?.querySelector<HTMLElement>(focusTarget)
    if (!target) return
    target.focus()
    setFocusTarget(null)
  })

  const cancelAll = () => {
    cancel()
    setFocusTarget('[data-continue]')
  }

  const removeFile = (id: number) => {
    const index = items.findIndex((item) => item.id === id)
    const neighbour = items[index + 1] ?? items[index - 1]
    remove(id)
    if (!neighbour) setStarted(false)
    setFocusTarget(neighbour ? `[data-remove="${neighbour.id}"]` : 'input[type="file"]')
  }

  // Set by "Try again": the message stays while the compressor loads, then focus moves on.
  const [retried, setRetried] = useState(false)
  const retryEngine = () => {
    setRetried(true)
    prepare()
  }
  const engineFailed = engine === 'failed' || (retried && engine === 'loading')
  useEffect(() => {
    if (retried && engine === 'ready') {
      setRetried(false)
      setFocusTarget('[data-focus-start]')
    }
  }, [retried, engine])

  const summary = summarizeQueue(items)
  const queuedIds = items.filter((item) => item.status === 'queued').map((item) => item.id)
  const cancelledIds = items.filter((item) => item.status === 'cancelled').map((item) => item.id)
  const startable = items.filter(
    (item) => item.error?.code !== 'unsupported-type' && item.error?.code !== 'file-too-large',
  )

  /** "Compress 3 photos": applies the options as they are now, then lets the queue run. */
  const begin = () => {
    if (targetBytes === undefined) return
    prepare()
    requeue(new Set(queuedIds), { targetBytes, format })
    setStarted(true)
    setFocusTarget('[data-cancel], [data-after-run]')
  }

  // "Choose another size" puts the photos back in the list, ready for new options. The queue
  // restarts only once the render has paused it, or it would run before the options show.
  const [restage, setRestage] = useState(0)
  const restaged = useRef(0)
  useEffect(() => {
    if (restage === restaged.current || started) return
    restaged.current = restage
    requeue(new Set(startable.map((item) => item.id)))
    setFocusTarget('input[name="cp-size"]:checked')
  })
  const chooseAnotherSize = () => {
    setStarted(false)
    setRestage((count) => count + 1)
  }

  // The list's state above its rows: preparing, then working with counts for a batch, then one
  // banner when it is finished.
  const batch = summary.total > 1
  const only = summary.total === 1 ? items[0] : undefined
  const onlyResult = only?.status === 'done' ? only.result : undefined
  const onlyUnreachable =
    only?.status === 'error' && only.error?.code === 'target-unreachable' ? only : undefined
  const preparing = started && summary.pending > 0 && engine === 'loading'
  const tone: Tone = !started
    ? 'plain'
    : preparing || busy
      ? 'working'
      : summary.cancelled > 0
        ? 'cancelled'
        : onlyUnreachable
          ? 'attention'
          : only
            ? onlyResult
              ? 'ready'
              : 'plain'
            : summary.failed > 0
              ? 'attention'
              : 'ready'
  const rest = summary.total - summary.done
  const sizes = (before: number, after: number) =>
    m.compress_image_sizes(
      { before: formatSize(before, locale), after: formatSize(after, locale) },
      { locale },
    )
  const [bannerTitle, bannerDetail] = ((): [string, string] => {
    if (tone === 'working') {
      const count = batch
        ? m.compress_image_progress_count(
            { done: String(summary.done), total: String(summary.total) },
            { locale },
          )
        : ''
      return preparing
        ? [
            m.compress_image_preparing_title({}, { locale }),
            m.compress_image_preparing_detail({ count: summary.pending }, { locale }),
          ]
        : [m.compress_image_working_title({}, { locale }), count]
    }
    if (tone === 'ready' && only && onlyResult) {
      const { meta } = onlyResult
      const target = formatSize(only.settings.targetBytes, locale)
      if (meta.outcome === 'already-under') {
        return [
          m.compress_image_already_under_title({ target }, { locale }),
          m.compress_image_already_under_detail(
            {
              before: formatSize(only.file.size, locale),
              after: formatSize(onlyResult.blob.size, locale),
            },
            { locale },
          ),
        ]
      }
      return [
        m.compress_image_result_under({ target }, { locale }),
        meta.converted
          ? m.compress_image_result_sizes_converted(
              {
                before: formatSize(only.file.size, locale),
                after: formatSize(onlyResult.blob.size, locale),
                format: FORMAT_LABEL[meta.format],
              },
              { locale },
            )
          : sizes(only.file.size, onlyResult.blob.size),
      ]
    }
    if (tone === 'ready') {
      // One target for the whole batch says "fit 50 KB"; mixed targets, only that it is done.
      const targets = new Set(done.map((item) => item.settings.targetBytes))
      const [target] = targets
      const count = String(summary.total)
      return [
        targets.size === 1 && target !== undefined
          ? m.compress_image_batch_ready({ count, target: formatSize(target, locale) }, { locale })
          : m.compress_image_batch_ready_any({ count }, { locale }),
        m.compress_image_batch_total(
          {
            before: formatSize(summary.bytesBefore, locale),
            after: formatSize(summary.bytesAfter, locale),
          },
          { locale },
        ),
      ]
    }
    // Portuguese plural rules count 0 as "one", so "none ready" has sentences of its own.
    if (tone === 'attention' && onlyUnreachable) {
      return [
        m.compress_image_unreachable_title(
          { target: formatSize(onlyUnreachable.settings.targetBytes, locale) },
          { locale },
        ),
        m.compress_image_unreachable_detail(
          { smallest: formatSize(smallestOf(onlyUnreachable), locale) },
          { locale },
        ),
      ]
    }
    if (tone === 'attention') {
      return summary.done === 0
        ? [
            m.compress_image_batch_none({}, { locale }),
            m.compress_image_batch_none_detail({}, { locale }),
          ]
        : [
            m.compress_image_batch_mixed(
              { done: summary.done, total: String(summary.total) },
              { locale },
            ),
            m.compress_image_batch_mixed_detail({ rest }, { locale }),
          ]
    }
    if (tone === 'cancelled') {
      return [
        m.compress_image_batch_cancelled({}, { locale }),
        summary.done === 0
          ? m.compress_image_cancelled_none({}, { locale })
          : `${m.compress_image_cancelled_done({ count: summary.done }, { locale })} ${m.compress_image_cancelled_rest({ count: rest }, { locale })}`,
      ]
    }
    return ['', '']
  })()
  // The banner's picture: the mascot squishes while working and celebrates a clean batch.
  const bannerImage =
    tone === 'working'
      ? preparing
        ? determined
        : squishing
      : tone === 'ready'
        ? batch
          ? celebrate
          : smiling
        : tone === 'attention'
          ? onlyUnreachable
            ? sad
            : determined
          : undefined

  // "Compress more" clears the finished list and returns to "Choose photos"; while photos are
  // processed, "Clear list" stops them.
  const compressMore = () => {
    clearFiles()
    setFocusTarget('input[type="file"]')
  }

  // "Download all": one run at a time for the list on screen, and a failure shown beside the button
  // with the photos left as they are (nothing is compressed again to make the ZIP). The lock is a
  // ref, not state, so a second click before React has rendered the first is ignored too. All of
  // it belongs to the list it was started for (`doneKey`): after "Compress more" a ZIP still being
  // made for the old list neither holds up the new one nor shows its failure over it.
  const doneKey = done.map((item) => item.id).join(',')
  const zipRunning = useRef<string | null>(null)
  const [zipBusyKey, setZipBusyKey] = useState<string | null>(null)
  const zipBusy = zipBusyKey === doneKey
  const [zipFailure, setZipFailure] = useState<{
    key: string
    reason: ZipFailure
    attempt: number
  } | null>(null)
  // How many times in a row, for a list, it failed for the same reason.
  const zipFailures = useRef({ key: '', reason: 'failed' as ZipFailure, count: 0 })

  const downloadAll = async () => {
    const key = doneKey
    if (zipRunning.current === key) return
    zipRunning.current = key
    setZipBusyKey(key)
    setZipFailure((failure) => (failure?.key === key ? null : failure))
    try {
      await downloadZip(
        done.flatMap((item) =>
          item.result ? [{ name: item.result.name, blob: item.result.blob }] : [],
        ),
        m.compress_image_zip_name({}, { locale }),
      )
      zipFailures.current = { key, reason: 'failed', count: 0 }
    } catch (error) {
      const reason = error instanceof ZipError ? error.reason : 'failed'
      const before = zipFailures.current
      const attempt = before.key === key && before.reason === reason ? before.count + 1 : 1
      zipFailures.current = { key, reason, count: attempt }
      setZipFailure({ key, reason, attempt })
    } finally {
      if (zipRunning.current === key) zipRunning.current = null
      setZipBusyKey((busy) => (busy === key ? null : busy))
    }
  }

  // "Try again" in the notice. The notice, and the button it was pressed on, go as the run starts, so
  // a keyboard that was on that button would fall to the page: the focus goes to the button that
  // stays, without scrolling. A tap or click that did not focus it leaves the focus where it is, and
  // nothing moves it when the run ends (the person may be anywhere by then).
  const retryZip = (pressed: HTMLElement) => {
    if (document.activeElement === pressed) {
      rootRef.current
        ?.querySelector<HTMLElement>('[data-after-run]')
        ?.focus({ preventScroll: true })
    }
    void downloadAll()
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
  const heicRefused = items.some(
    (item) => item.error?.code === 'unsupported-type' && /\.hei[cf]$/i.test(item.file.name),
  )

  // The next preset that holds what the photo needs: "Try 100 KB".
  const tryPreset = onlyUnreachable
    ? PRESETS.find((p) => p.bytes >= smallestOf(onlyUnreachable))
    : undefined
  const tryAgainWith = (bytes: number, key: string) => {
    if (!only) return
    setTargetChoice(key)
    requeue(new Set([only.id]), { targetBytes: bytes })
    setFocusTarget('[data-cancel], [data-after-run]')
  }

  // The primary download of a finished banner: one file, or all of them in a ZIP.
  const downloadAction = (() => {
    if (done.length === 0) return null
    if (done.length === 1) {
      const result = done[0]?.result
      if (!result) return null
      const label =
        batch || !result.meta.converted
          ? m.compress_image_download({}, { locale })
          : m.compress_image_download_format(
              { format: FORMAT_LABEL[result.meta.format] },
              { locale },
            )
      return (
        <a
          data-after-run
          className="cp-btn cp-btn-lg cp-btn-primary"
          href={result.url}
          download={result.name}
          aria-label={m.compress_image_download_named({ name: result.name }, { locale })}
        >
          {label}
        </a>
      )
    }
    return (
      // `aria-disabled`, not `disabled`: the button keeps keyboard focus while the ZIP is made.
      // Both labels sit in one grid cell, so the button does not change size between them; the one
      // that is not shown is `aria-hidden`, so only the other is its name.
      <button
        type="button"
        data-after-run
        className="cp-btn cp-btn-lg cp-btn-primary"
        aria-disabled={zipBusy || undefined}
        aria-busy={zipBusy || undefined}
        onClick={() => void downloadAll()}
      >
        <span className="cp-swap">
          <span data-on={!zipBusy || undefined} aria-hidden={zipBusy || undefined}>
            {done.length === summary.total
              ? m.compress_image_download_all({}, { locale })
              : m.compress_image_download_count({ count: String(done.length) }, { locale })}
          </span>
          <span data-on={zipBusy || undefined} aria-hidden={!zipBusy || undefined}>
            {m.compress_image_zip_preparing({}, { locale })}
          </span>
        </span>
      </button>
    )
  })()

  // Drag, drop and paste work wherever the person is in the panel.
  const takeFiles = (files: File[]) => addFiles(files)
  const takeRef = useRef(takeFiles)
  takeRef.current = takeFiles
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? [])
      // Text pasted into a field is left alone; only files are taken.
      if (files.length === 0) return
      event.preventDefault()
      takeRef.current(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files')

  if (!runnable) {
    return (
      <div className="cp">
        <CenterState
          image={sad}
          title={m.compress_image_browser_title({}, { locale })}
          text={m.compress_image_browser_text({}, { locale })}
        />
      </div>
    )
  }

  const showOptions = !started && !(items.length > 0 && queuedIds.length === 0)
  const listOnly = items.length > 0 && !started && queuedIds.length === 0
  const staged = !started && items.length > STAGED_ROWS
  const rows = staged ? items.slice(0, STAGED_ROWS) : items
  const targetNote =
    targetBytes === undefined
      ? ''
      : m.compress_image_target_note({ target: formatSize(targetBytes, locale) }, { locale })

  const list = (
    <ul className="cp-list" aria-label={m.compress_image_list_label({}, { locale })}>
      {rows.map((item) => (
        <PhotoRow
          key={item.id}
          item={item}
          locale={locale}
          started={started}
          fitsTag={tone === 'plain' || tone === 'working' || tone === 'cancelled'}
          stageMessage={stageMessage}
          errorText={errorMessage(item)}
          onRemove={() => removeFile(item.id)}
        />
      ))}
    </ul>
  )

  const tooManyNotice = tooMany && (
    <div className="cp-notice" role="alert">
      <WarningIcon />
      <span className="cp-notice-body">
        <b>
          {m.compress_image_too_many_title(
            { maxFiles: String(manifest.limits.maxFiles) },
            { locale },
          )}
        </b>
        <span className="cp-small">{m.compress_image_too_many_detail({}, { locale })}</span>
      </span>
    </div>
  )

  const engineBlock = engineFailed && (
    <CenterState
      image={sad}
      title={m.compress_image_engine_failed_title({}, { locale })}
      text={m.compress_image_engine_failed({}, { locale })}
      action={
        <button
          type="button"
          data-focus-start
          className="cp-btn cp-btn-lg cp-btn-primary"
          onClick={retryEngine}
        >
          {m.compress_image_engine_retry({}, { locale })}
        </button>
      }
    />
  )

  return (
    // Drop target only: the same photos can be added with the real file input and by paste.
    // biome-ignore lint/a11y/noStaticElementInteractions: see above
    <div
      ref={rootRef}
      className="cp"
      data-engine={engine}
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        setDragging(false)
        takeFiles(Array.from(event.dataTransfer.files))
      }}
    >
      {engineFailed && items.length === 0 ? (
        engineBlock
      ) : (
        <>
          {engineFailed && engineBlock}
          {items.length > 0 && started && (
            <section
              aria-label={m.compress_image_list_label({}, { locale })}
              className="cp-col cp-g16"
            >
              <Banner
                tone={tone}
                image={bannerImage}
                title={bannerTitle}
                detail={bannerDetail}
                meter={
                  tone === 'working' && (
                    <Meter
                      label={bannerTitle}
                      value={
                        preparing
                          ? undefined
                          : batch
                            ? summary.done / summary.total
                            : (only?.progress ?? 0)
                      }
                    />
                  )
                }
                actions={
                  <>
                    {tone === 'working' && (
                      <button
                        type="button"
                        data-cancel
                        className="cp-btn cp-btn-ghost"
                        onClick={cancelAll}
                      >
                        {m.compress_image_cancel({}, { locale })}
                      </button>
                    )}
                    {tone === 'ready' && (
                      <>
                        {downloadAction}
                        <button
                          type="button"
                          className="cp-btn cp-btn-lg cp-btn-ghost"
                          onClick={compressMore}
                        >
                          {batch
                            ? m.compress_image_compress_more({}, { locale })
                            : m.compress_image_compress_another({}, { locale })}
                        </button>
                      </>
                    )}
                    {tone === 'attention' && onlyUnreachable && (
                      <>
                        {tryPreset && (
                          <button
                            type="button"
                            data-after-run
                            className="cp-btn cp-btn-lg cp-btn-primary"
                            onClick={() => tryAgainWith(tryPreset.bytes, tryPreset.key)}
                          >
                            {m.compress_image_try_size(
                              { size: formatSize(tryPreset.bytes, locale) },
                              { locale },
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          data-after-run
                          className="cp-btn cp-btn-lg cp-btn-ghost"
                          onClick={chooseAnotherSize}
                        >
                          {m.compress_image_choose_size({}, { locale })}
                        </button>
                      </>
                    )}
                    {tone === 'attention' && !onlyUnreachable && (
                      <>
                        {downloadAction}
                        <button
                          type="button"
                          className="cp-btn cp-btn-lg cp-btn-ghost"
                          onClick={compressMore}
                        >
                          {m.compress_image_compress_again({}, { locale })}
                        </button>
                      </>
                    )}
                    {tone === 'cancelled' && (
                      <>
                        {downloadAction}
                        {/* Continues with the settings the files were added with. */}
                        <button
                          type="button"
                          data-continue
                          className="cp-btn cp-btn-lg cp-btn-ghost"
                          onClick={() => requeue(new Set(cancelledIds))}
                        >
                          {m.compress_image_rerun({}, { locale })}
                        </button>
                        {done.length === 0 && (
                          <button type="button" className="cp-btn cp-btn-lg" onClick={compressMore}>
                            {m.compress_image_clear({}, { locale })}
                          </button>
                        )}
                      </>
                    )}
                  </>
                }
              />
              {done.map(
                (item) =>
                  item.result?.meta.flattenedTransparency && (
                    <div key={item.id} className="cp-notice" role="status">
                      <WarningIcon />
                      <span className="cp-notice-body">
                        <b>{m.compress_image_flattened_title({}, { locale })}</b>
                        <span className="cp-small">
                          {m.compress_image_flattened({}, { locale })}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="cp-btn cp-btn-soft"
                        disabled={busy}
                        onClick={() => requeue(new Set([item.id]), { format: 'webp' })}
                      >
                        {m.compress_image_keep_transparency({}, { locale })}
                      </button>
                    </div>
                  ),
              )}
              {/* A live region that is always there, so the failure is announced when it appears. */}
              <div role="status" className="empty:hidden">
                {zipFailure?.key === doneKey && (
                  <ZipFailureNotice
                    key={zipFailure.attempt}
                    locale={locale}
                    reason={zipFailure.reason}
                    attempt={zipFailure.attempt}
                    onRetry={retryZip}
                  />
                )}
              </div>
              {tooManyNotice}
              {list}
            </section>
          )}

          {items.length > 0 && !started && listOnly && (
            <div className="cp-col cp-g16">
              {list}
              {heicRefused && (
                <p className="cp-note">{m.compress_image_heic_note({}, { locale })}</p>
              )}
            </div>
          )}

          {started && heicRefused && (
            <p className="cp-note">{m.compress_image_heic_note({}, { locale })}</p>
          )}

          {showOptions && (
            <>
              {/* Phones: one column. From 900 px: options on the left, drop area or list on the right. */}
              <div className="cp-grid">
                <div className="cp-col cp-g24">
                  <fieldset className="cp-step">
                    <legend>
                      <h2 className="cp-h-sm">{m.compress_image_target_legend({}, { locale })}</h2>
                    </legend>
                    <div className="cp-chips">
                      {[
                        ...PRESETS.map((p) => ({
                          value: p.key as string,
                          label: formatSize(p.bytes, locale),
                        })),
                        { value: 'custom', label: m.compress_image_target_custom({}, { locale }) },
                      ].map((option) => (
                        <label key={option.value} className="cp-chip">
                          <input
                            type="radio"
                            name="cp-size"
                            value={option.value}
                            checked={targetChoice === option.value}
                            onChange={() => setTargetChoice(option.value)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                    {targetChoice === 'custom' && (
                      <div className="cp-custom">
                        <label className="cp-custom-label" htmlFor="cp-custom-input">
                          {m.compress_image_custom_label({}, { locale })}
                        </label>
                        <div className="cp-field-row">
                          <input
                            id="cp-custom-input"
                            type="text"
                            inputMode="decimal"
                            className="cp-input"
                            value={customText}
                            onChange={(event) => setCustomText(event.currentTarget.value)}
                            aria-invalid={customInvalid}
                            aria-describedby="cp-custom-error"
                          />
                          <span className="cp-unit">
                            <select
                              aria-label={m.compress_image_custom_unit_label({}, { locale })}
                              value={customUnit}
                              onChange={(event) =>
                                setCustomUnit(event.currentTarget.value as SizeUnit)
                              }
                            >
                              <option value="kb">KB</option>
                              <option value="mb">MB</option>
                            </select>
                            <ChevronIcon />
                          </span>
                        </div>
                        <p id="cp-custom-error" role="alert" className="cp-error">
                          {customInvalid && <AlertIcon />}
                          {customInvalid && custom?.ok === false
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
                    {targetNote && <span className="cp-small cp-muted">{targetNote}</span>}
                  </fieldset>

                  <fieldset className="cp-step">
                    <legend>
                      <h2 className="cp-h-sm">{m.compress_image_format_legend({}, { locale })}</h2>
                    </legend>
                    <div className="cp-chips">
                      {[
                        {
                          value: 'original' as const,
                          label: m.compress_image_format_original({}, { locale }),
                        },
                        {
                          value: 'jpeg' as const,
                          label: m.compress_image_format_jpeg({}, { locale }),
                        },
                        {
                          value: 'webp' as const,
                          label: m.compress_image_format_webp({}, { locale }),
                        },
                      ].map((option) => (
                        <label key={option.value} className="cp-chip">
                          <input
                            type="radio"
                            name="cp-format"
                            value={option.value}
                            checked={format === option.value}
                            onChange={() => setFormat(option.value)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                    <span className="cp-small cp-muted">
                      {m.compress_image_format_note({}, { locale })}
                    </span>
                  </fieldset>
                  {hasWebp && format !== 'jpeg' && (
                    <div className="cp-notice" role="status">
                      <WarningIcon />
                      <span className="cp-notice-body cp-small">
                        {m.compress_image_webp_hint({}, { locale })}
                      </span>
                    </div>
                  )}
                </div>

                {items.length === 0 ? (
                  <Drop
                    locale={locale}
                    dragging={dragging}
                    disabled={targetBytes === undefined}
                    onFiles={addFiles}
                  />
                ) : (
                  <div className="cp-col cp-g12">
                    {tooManyNotice}
                    {list}
                    {staged && (
                      <span className="cp-more">
                        {m.compress_image_more_photos(
                          { count: items.length - STAGED_ROWS },
                          { locale },
                        )}
                      </span>
                    )}
                    <div className="cp-actions">
                      <button
                        type="button"
                        data-focus-start
                        className="cp-btn cp-btn-lg cp-btn-primary cp-btn-block-phone"
                        disabled={targetBytes === undefined}
                        onClick={begin}
                      >
                        {m.compress_image_start({ count: queuedIds.length }, { locale })}
                      </button>
                      <button type="button" className="cp-btn cp-btn-lg" onClick={compressMore}>
                        {m.compress_image_clear({}, { locale })}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <p className="cp-privacy">
                <LockIcon />
                <span>{m.compress_image_privacy_note({}, { locale })}</span>
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** The smallest size the worker could reach, from the error's details (0 when unknown). */
function smallestOf(item: Item): number {
  return Number(item.error?.details?.smallestBytes ?? 0)
}

function Banner({
  tone,
  image,
  title,
  detail,
  meter,
  actions,
}: {
  tone: Tone
  image: Picture | undefined
  title: string
  detail: string
  meter?: ReactNode
  actions: ReactNode
}) {
  // One element across every tone, so its status text stays a single live region: each change
  // is announced once and focus never moves by itself.
  return (
    <div data-tone={tone} data-ready={tone === 'ready' || undefined} className="cp-banner">
      {image && (
        <img src={image.src} alt="" width={image.width} height={image.height} className="cp-expr" />
      )}
      <div className="cp-banner-body">
        <div role="status" className="cp-col empty:sr-only">
          {title && <span className="cp-h-md">{title}</span>}
          {detail && <span className="cp-detail">{detail}</span>}
        </div>
        {meter}
      </div>
      <div className="cp-actions">{actions}</div>
    </div>
  )
}

function Meter({ label, value }: { label: string; value: number | undefined }) {
  // Native <progress>: accessible by default and styled without inline styles, which the CSP
  // forbids. Without a value the work cannot be measured (preparing): a sliding bar, no number.
  if (value === undefined) {
    return (
      <span className="cp-meter" role="progressbar" aria-label={label}>
        <span className="cp-indet" />
      </span>
    )
  }
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <progress className="cp-progress" max={100} value={percent} aria-label={label}>
      {percent}%
    </progress>
  )
}

/**
 * "Download all" failed. Says what to do next: try again, or download the photos one by one, which
 * never needs the ZIP. After a second failure to load the ZIP code, trying again will not help in
 * every browser (Chromium keeps the failure until the page is reloaded), so it says to reload, and
 * that the photos then have to be compressed again. There is no wording for "too big for one ZIP"
 * (`ZipFailure` `too-large`): 20 photos of up to 50 MB are far below what a ZIP can hold, so it
 * cannot happen here; Convert image, with much bigger results, will need it.
 */
function ZipFailureNotice({
  locale,
  reason,
  attempt,
  onRetry,
}: {
  locale: Locale
  reason: ZipFailure
  attempt: number
  onRetry: (pressed: HTMLElement) => void
}) {
  const reload = reason === 'load' && attempt >= 2
  return (
    <div className="cp-notice cp-notice-danger">
      <WarningIcon />
      <span className="cp-notice-body">
        <b>{m.compress_image_zip_error_title({}, { locale })}</b>
        <span className="cp-small">
          {reload
            ? m.compress_image_zip_error_reload({}, { locale })
            : m.compress_image_zip_error_retry({}, { locale })}
        </span>
      </span>
      {!reload && (
        <button
          type="button"
          className="cp-btn cp-btn-soft"
          onClick={(event) => onRetry(event.currentTarget)}
        >
          {/* The same words as "Try again" for the compressor that did not load. */}
          {m.compress_image_engine_retry({}, { locale })}
        </button>
      )}
    </div>
  )
}

function CenterState({
  image,
  title,
  text,
  action,
}: {
  image: Picture
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="cp-center" role="alert">
      <img src={image.src} alt="" width={image.width} height={image.height} className="cp-expr" />
      <span className="cp-h-md">{title}</span>
      <span className="cp-muted">{text}</span>
      {action}
    </div>
  )
}

function Drop({
  locale,
  dragging,
  disabled,
  onFiles,
}: {
  locale: Locale
  dragging: boolean
  disabled: boolean
  onFiles: (files: File[]) => void
}) {
  const id = useId()
  const labelId = useId()
  const hintId = useId()
  return (
    <label
      htmlFor={id}
      className="cp-drop"
      data-dragging={dragging || undefined}
      data-disabled={disabled || undefined}
    >
      {dragging ? (
        <>
          <img
            src={excited.src}
            alt=""
            width={excited.width}
            height={excited.height}
            className="cp-expr"
          />
          <span className="cp-h-md">{m.compress_image_drop_dragging({}, { locale })}</span>
        </>
      ) : (
        <>
          <img
            src={normal.src}
            alt=""
            width={normal.width}
            height={normal.height}
            className="cp-expr"
          />
          <span {...{ role: 'heading', 'aria-level': 2 }} className="cp-h-md">
            {m.compress_image_drop_step({}, { locale })}
          </span>
          <span
            id={labelId}
            data-primary-action
            className="cp-btn cp-btn-lg cp-btn-primary cp-drop-button"
          >
            <UploadIcon />
            {m.compress_image_drop_label({}, { locale })}
          </span>
          <span id={hintId} className="cp-small cp-muted">
            {m.compress_image_drop_hint(
              {
                maxFiles: String(manifest.limits.maxFiles),
                maxSize: formatSize(manifest.limits.maxFileSizeBytes, locale),
              },
              { locale },
            )}
          </span>
          <span className="cp-small cp-muted cp-only-desk">
            {m.compress_image_paste_hint({}, { locale })}
          </span>
        </>
      )}
      <input
        id={id}
        type="file"
        data-focus-start
        aria-labelledby={labelId}
        aria-describedby={hintId}
        accept={manifest.accepts.join(',')}
        multiple
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          if (files.length > 0) onFiles(files)
          // Allow choosing the same file again.
          event.currentTarget.value = ''
        }}
      />
    </label>
  )
}

function PhotoRow({
  item,
  locale,
  started,
  fitsTag,
  stageMessage,
  errorText,
  onRemove,
}: {
  item: Item
  locale: Locale
  started: boolean
  fitsTag: boolean
  stageMessage: (stage: string | undefined) => string
  errorText: string
  onRemove: () => void
}) {
  const result = item.status === 'done' ? item.result : undefined
  const unreachable = item.error?.code === 'target-unreachable'
  const failed = item.status === 'error' && !unreachable
  const smallest = unreachable ? smallestOf(item) : 0
  const before = formatSize(item.file.size, locale)
  const removeLabel = m.compress_image_remove_named({ name: item.file.name }, { locale })
  const removeButton = (
    <button
      type="button"
      className="cp-icon-btn"
      aria-label={removeLabel}
      data-remove={item.id}
      onClick={onRemove}
    >
      <XIcon />
    </button>
  )
  return (
    <li
      className="cp-item"
      data-status={item.status}
      {...(failed ? { 'data-failed': '' } : {})}
      {...(unreachable || result?.meta.flattenedTransparency ? { 'data-attention': '' } : {})}
    >
      <span className={`cp-tile ${failed ? 'cp-tile-danger' : 'cp-tile-mango'}`} aria-hidden="true">
        {failed ? <XIcon size={22} stroke={2.6} /> : <ImageIcon />}
      </span>
      <span className="cp-col cp-grow">
        <FileName name={item.file.name} className="cp-name" />
        <span className="cp-facts">
          {result ? (
            <>
              <span className="cp-mono">
                <s>{before}</s> → <b>{formatSize(result.blob.size, locale)}</b>
              </span>
              <ResultTags item={item} result={result} locale={locale} fitsTag={fitsTag} />
            </>
          ) : unreachable ? (
            <span className="cp-mono">
              <s>{before}</s> → <b>{formatSize(smallest, locale)}</b>
            </span>
          ) : (
            <span className="cp-mono">{before}</span>
          )}
        </span>
        {item.status === 'working' && (
          <Meter
            label={m.compress_image_progress_label({ name: item.file.name }, { locale })}
            value={item.progress > 0 ? item.progress : undefined}
          />
        )}
        {item.status === 'error' && (
          <span className={failed ? 'cp-note cp-note-danger' : 'cp-note'} role="alert">
            {errorText}
          </span>
        )}
        {result && <ResultNotes item={item} result={result} locale={locale} />}
      </span>
      {result ? (
        <a
          className="cp-icon-btn"
          href={result.url}
          download={result.name}
          aria-label={m.compress_image_download_named({ name: result.name }, { locale })}
        >
          <DownloadIcon />
        </a>
      ) : item.status === 'queued' && started ? (
        <span className="cp-wait">{m.compress_image_status_waiting({}, { locale })}</span>
      ) : item.status === 'working' ? (
        <span className="cp-wait" aria-live="polite">
          {stageMessage(item.stage)}
        </span>
      ) : item.status === 'cancelled' ? (
        <span className="cp-wait">{m.compress_image_cancelled({}, { locale })}</span>
      ) : (
        removeButton
      )}
    </li>
  )
}

function ResultTags({
  item,
  result,
  locale,
  fitsTag,
}: {
  item: Item
  result: NonNullable<Item['result']>
  locale: Locale
  fitsTag: boolean
}) {
  const { meta } = result
  const target = formatSize(item.settings.targetBytes, locale)
  // Short facts as tags, one plain note for what needs a sentence. The resize note does not say
  // why: the 16 MP memory cap also shrinks photos that fit.
  return (
    <>
      {meta.outcome === 'already-under' ? (
        <span className="cp-tag cp-tag-ube">
          {m.compress_image_tag_already_under({ target }, { locale })}
        </span>
      ) : (
        fitsTag && (
          <span className="cp-tag cp-tag-matcha">
            {m.compress_image_tag_fits({ target }, { locale })}
          </span>
        )
      )}
      <span className="cp-tag cp-tag-matcha">{m.compress_image_tag_metadata({}, { locale })}</span>
      {meta.converted && item.settings.format === 'original' && (
        <span className="cp-tag cp-tag-ube">
          {m.compress_image_converted({ format: FORMAT_LABEL[meta.format] }, { locale })}
        </span>
      )}
      {meta.flattenedTransparency && (
        <span className="cp-tag cp-tag-mango">
          {m.compress_image_tag_flattened({}, { locale })}
        </span>
      )}
      {meta.resized && (
        <span className="cp-tag cp-tag-mango">{m.compress_image_tag_resized({}, { locale })}</span>
      )}
    </>
  )
}

function ResultNotes({
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
      {meta.outcome === 'already-under' && (
        <span className="cp-note">{m.compress_image_already_under_note({}, { locale })}</span>
      )}
      {meta.resized && (
        <span className="cp-note">
          {m.compress_image_resized(
            {
              from: size(meta.originalWidth, meta.originalHeight),
              to: size(meta.width, meta.height),
            },
            { locale },
          )}
        </span>
      )}
    </>
  )
}

interface IconProps {
  size?: number
  stroke?: number
}

function Svg({ d, size, stroke }: { d: string; size: number; stroke: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  )
}

const ImageIcon = ({ size = 22, stroke = 2 }: IconProps) => (
  <Svg d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5" size={size} stroke={stroke} />
)
const XIcon = ({ size = 18, stroke = 2.4 }: IconProps) => (
  <Svg d="M6 6l12 12M18 6 6 18" size={size} stroke={stroke} />
)
const DownloadIcon = ({ size = 20, stroke = 2.4 }: IconProps) => (
  <Svg d="M12 4v12M7 11l5 5 5-5M5 20h14" size={size} stroke={stroke} />
)
const UploadIcon = ({ size = 22, stroke = 2.4 }: IconProps) => (
  <Svg d="M12 16V4M7 9l5-5 5 5M5 20h14" size={size} stroke={stroke} />
)
const LockIcon = ({ size = 18, stroke = 2 }: IconProps) => (
  <Svg d="M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z" size={size} stroke={stroke} />
)
const WarningIcon = ({ size = 22, stroke = 2.4 }: IconProps) => (
  <Svg d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" size={size} stroke={stroke} />
)
const AlertIcon = ({ size = 18, stroke = 2.4 }: IconProps) => (
  <Svg d="M12 8v5M12 17h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" size={size} stroke={stroke} />
)
const ChevronIcon = ({ size = 14, stroke = 2.6 }: IconProps) => (
  <Svg d="m6 9 6 6 6-6" size={size} stroke={stroke} />
)
