import type { Locale } from '@mochifile/i18n'
import { m } from '@mochifile/i18n/messages'
import { formatBytes, isToolError, type ToolErrorCode, type ToolResult } from '@mochifile/tool-kit'
import { createToolClient } from '@mochifile/tool-kit/client'
import { Button, Dropzone } from '@mochifile/ui'
import { useEffect, useRef, useState } from 'react'
import { manifest } from './manifest.ts'

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

export default function TemplateToolUi({ locale }: { locale: Locale }) {
  const [state, setState] = useState<State>({ status: 'idle' })
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
      const [result] = await client.run(files, manifest.defaults, {
        signal: controller.signal,
        onProgress: ({ ratio }) =>
          setState({ status: 'working', percent: Math.round(ratio * 100) }),
      })
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
            className="inline-flex min-h-11 items-center rounded-control bg-accent px-5 font-medium text-on-accent hover:bg-accent-hover"
          >
            {m.template_tool_download({ name: state.result.name }, { locale })}
          </a>
        )}
        {state.status === 'error' && (
          <p role="alert" className="text-accent">
            {errorMessage(state.code)}
          </p>
        )}
      </div>
    </div>
  )
}
