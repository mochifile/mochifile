import type { Locale } from '@mochifile/i18n'
import { m } from '@mochifile/i18n/messages'
import {
  formatBytes,
  isToolError,
  type ToolErrorCode,
  type ToolOptions,
  type ToolResult,
} from '@mochifile/tool-kit'
import { createToolClient } from '@mochifile/tool-kit/client'
import { Button, Dropzone } from '@mochifile/ui'
import { useEffect, useRef, useState } from 'react'
import { manifest, type TemplateOptions } from './manifest.ts'

/** One client per page; the worker starts on the first run, not on page load. */
const client = createToolClient(
  manifest,
  () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
)

type State =
  | { status: 'idle' }
  | { status: 'working'; percent: number }
  | { status: 'done'; result: ToolResult; url: string }
  | { status: 'error'; code: ToolErrorCode | 'unknown' }

interface Props {
  locale: Locale
  /** Options of a variant page (e.g. `{ mode: 'lower' }`), as untyped plain data. */
  initialOptions?: ToolOptions
}

/** Narrows untyped page options to this tool's options, falling back to the defaults. */
function initialMode(options: ToolOptions | undefined): TemplateOptions['mode'] {
  return options?.mode === 'lower' || options?.mode === 'upper'
    ? options.mode
    : manifest.defaults.mode
}

export default function TemplateToolUi({ locale, initialOptions }: Props) {
  const [state, setState] = useState<State>({ status: 'idle' })
  const [mode, setMode] = useState(() => initialMode(initialOptions))
  const abortRef = useRef<AbortController | null>(null)

  // Release the object URL when the result changes or the component unmounts.
  useEffect(() => {
    if (state.status !== 'done') return
    return () => URL.revokeObjectURL(state.url)
  }, [state])

  const run = async (files: File[]) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ status: 'working', percent: 0 })
    try {
      const [result] = await client.run(
        files,
        { mode },
        {
          signal: controller.signal,
          onProgress: ({ ratio }) =>
            setState({ status: 'working', percent: Math.round(ratio * 100) }),
        },
      )
      if (!result) throw new Error('No result')
      setState({ status: 'done', result, url: URL.createObjectURL(result.file) })
    } catch (error) {
      if (isToolError(error) && error.code === 'aborted') return setState({ status: 'idle' })
      setState({ status: 'error', code: isToolError(error) ? error.code : 'unknown' })
    }
  }

  const errorMessage = (code: ToolErrorCode | 'unknown') => {
    if (code === 'unsupported-type') return m.template_tool_error_unsupported({}, { locale })
    if (code === 'file-too-large') return m.template_tool_error_too_large({}, { locale })
    return m.template_tool_error({}, { locale })
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="mb-2 font-medium">{m.template_tool_mode_label({}, { locale })}</legend>
        {(['upper', 'lower'] as const).map((value) => (
          <label key={value} className="flex min-h-target-min items-center gap-2">
            <input
              type="radio"
              name="template-tool-mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="size-5 accent-action"
            />
            {value === 'upper'
              ? m.template_tool_mode_upper({}, { locale })
              : m.template_tool_mode_lower({}, { locale })}
          </label>
        ))}
      </fieldset>
      <Dropzone
        onFiles={run}
        accept={manifest.accepts.join(',')}
        disabled={state.status === 'working'}
        label={m.template_tool_drop_label({}, { locale })}
        hint={m.template_tool_drop_hint(
          { maxSize: formatBytes(manifest.limits.maxFileSizeBytes, locale) },
          { locale },
        )}
      />
      <div aria-live="polite" className="flex flex-wrap items-center gap-3">
        {state.status === 'working' && (
          <>
            <span>{m.template_tool_processing({ percent: state.percent }, { locale })}</span>
            <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
              {m.template_tool_cancel({}, { locale })}
            </Button>
          </>
        )}
        {state.status === 'done' && (
          <a
            href={state.url}
            download={state.result.name}
            className="inline-flex min-h-target-min items-center rounded-pill bg-action px-5 font-medium text-action-ink"
          >
            {m.template_tool_download({ name: state.result.name }, { locale })}
          </a>
        )}
        {state.status === 'error' && (
          <p role="alert" className="text-danger">
            {errorMessage(state.code)}
          </p>
        )}
      </div>
    </div>
  )
}
