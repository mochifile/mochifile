import {
  isToolError,
  type ToolErrorCode,
  type ToolErrorDetails,
  type ToolProgress,
  type ToolResult,
} from '@mochifile/tool-kit'
import { useCallback, useEffect, useRef, useState } from 'react'

export type QueueStatus = 'queued' | 'working' | 'done' | 'error' | 'cancelled'

/** One file in a tool's list, with the settings it is (or was) processed with. */
export interface QueueItem<Settings, Meta> {
  id: number
  file: File
  status: QueueStatus
  settings: Settings
  progress: number
  stage?: string
  result?: { blob: Blob; url: string; name: string; meta: Meta }
  error?: { code: ToolErrorCode | 'unknown'; details: ToolErrorDetails | undefined }
}

export interface FileQueue<Settings, Meta> {
  items: ReadonlyArray<QueueItem<Settings, Meta>>
  /**
   * Adds files with `settings` and starts processing. Files over `maxFiles` are dropped; the
   * return value says whether that happened. Invalid files are added as errors.
   */
  add(files: File[], settings: Settings): { tooMany: boolean }
  /**
   * Processes the given items again, with changed settings or, without them, the settings each
   * was added with (as when continuing after a cancel).
   */
  requeue(ids: ReadonlySet<number>, settings?: Partial<Settings>): void
  /** Stops the current file and skips the queued ones. */
  cancel(): void
  /** Takes one file out of the list, stopping it first if it is being processed. */
  remove(id: number): void
  /** Stops and removes everything. */
  clear(): void
  /** Items processed successfully. */
  done: ReadonlyArray<QueueItem<Settings, Meta>>
  /** Whether a file is waiting or being processed. */
  busy: boolean
}

let nextId = 1

/**
 * A list of files processed one at a time in the tool's worker: the state machine shared by
 * every tool (queued → working → done, error or cancelled). Object URLs of results are released
 * when items are requeued, cleared, or the component goes away.
 */
export function useFileQueue<Settings, Meta>({
  run,
  maxFiles,
  validate,
  paused = false,
}: {
  /** Processes one file; called with the item's current settings. */
  run: (
    item: QueueItem<Settings, Meta>,
    context: { signal: AbortSignal; onProgress: (progress: ToolProgress) => void },
  ) => Promise<ToolResult>
  maxFiles: number
  /** Throws a `ToolError` if the file is not acceptable (type, size). */
  validate: (file: File) => void
  /**
   * While true, files wait in the list instead of starting, as when the tool's code has not
   * loaded; they start when it turns false. A file already being processed finishes.
   */
  paused?: boolean
}): FileQueue<Settings, Meta> {
  const [items, setItemsState] = useState<QueueItem<Settings, Meta>[]>([])
  const itemsRef = useRef<QueueItem<Settings, Meta>[]>([])
  const runningRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // The latest `run`, so an in-flight queue uses the current settings and client.
  const runRef = useRef(run)
  runRef.current = run
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const setItems = useCallback(
    (update: (list: QueueItem<Settings, Meta>[]) => QueueItem<Settings, Meta>[]) => {
      itemsRef.current = update(itemsRef.current)
      setItemsState(itemsRef.current)
    },
    [],
  )
  const patch = useCallback(
    (id: number, changes: Partial<QueueItem<Settings, Meta>>) =>
      setItems((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item))),
    [setItems],
  )

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
        if (pausedRef.current) break
        const next = itemsRef.current.find((item) => item.status === 'queued')
        if (!next) break
        const controller = new AbortController()
        abortRef.current = controller
        patch(next.id, { status: 'working', progress: 0 })
        try {
          const result = await runRef.current(next, {
            signal: controller.signal,
            onProgress: ({ ratio, stage }) =>
              patch(next.id, { progress: ratio, ...(stage ? { stage } : {}) }),
          })
          // Removed or cleared while it finished: no object URL for a row that is gone.
          if (!itemsRef.current.some((item) => item.id === next.id)) continue
          patch(next.id, {
            status: 'done',
            result: {
              blob: result.file,
              url: URL.createObjectURL(result.file),
              name: result.name,
              meta: result.meta as unknown as Meta,
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

  // Files added while paused start once the queue may run.
  useEffect(() => {
    if (!paused) void runQueue()
  }, [paused, runQueue])

  const add = (files: File[], settings: Settings) => {
    const room = maxFiles - itemsRef.current.length
    const added = files.slice(0, Math.max(0, room)).map((file): QueueItem<Settings, Meta> => {
      const base = { id: nextId++, file, settings, progress: 0 }
      try {
        validate(file)
        return { ...base, status: 'queued' }
      } catch (error) {
        const code = isToolError(error) ? error.code : 'unknown'
        return { ...base, status: 'error', error: { code, details: undefined } }
      }
    })
    setItems((list) => [...list, ...added])
    void runQueue()
    return { tooMany: files.length > room }
  }

  const requeue = (ids: ReadonlySet<number>, settings: Partial<Settings> = {}) => {
    setItems((list) =>
      list.map((item) => {
        // A file being processed keeps its run; requeueing it would start a second one.
        if (!ids.has(item.id) || item.status === 'working') return item
        if (item.result) URL.revokeObjectURL(item.result.url)
        const { result: _result, error: _error, stage: _stage, ...rest } = item
        return {
          ...rest,
          settings: { ...item.settings, ...settings },
          status: 'queued',
          progress: 0,
        }
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

  const remove = (id: number) => {
    const item = itemsRef.current.find((candidate) => candidate.id === id)
    if (!item) return
    // The queue moves on to the next file once the aborted run settles.
    if (item.status === 'working') abortRef.current?.abort()
    if (item.result) URL.revokeObjectURL(item.result.url)
    setItems((list) => list.filter((candidate) => candidate.id !== id))
  }

  const clear = () => {
    abortRef.current?.abort()
    for (const item of itemsRef.current) if (item.result) URL.revokeObjectURL(item.result.url)
    setItems(() => [])
  }

  return {
    items,
    add,
    requeue,
    cancel,
    remove,
    clear,
    done: items.filter((item) => item.status === 'done'),
    busy: items.some((item) => item.status === 'queued' || item.status === 'working'),
  }
}
