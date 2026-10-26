import { ToolError, type ToolResult } from '@mochifile/tool-kit'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileQueue } from './use-file-queue.ts'

const file = (name: string) => new File(['image'], name, { type: 'image/jpeg' })
const output = (name: string): ToolResult => ({ file: new Blob(['result']), name, meta: {} })

let createObjectURL: ReturnType<typeof vi.fn>
let revokeObjectURL: ReturnType<typeof vi.fn>

beforeEach(() => {
  createObjectURL = vi.fn().mockReturnValueOnce('blob:first').mockReturnValue('blob:next')
  revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useFileQueue', () => {
  it('runs one file at a time and keeps the settings chosen when each file was added', async () => {
    let finishFirst = (_result: ToolResult) => {}
    const first = new Promise<ToolResult>((resolve) => {
      finishFirst = resolve
    })
    const run = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockImplementation(async (item) => output(`${item.file.name}-${item.settings.size}`))
    const { result } = renderHook(() =>
      useFileQueue<{ size: number }, object>({ run, maxFiles: 2, validate: () => {} }),
    )

    act(() => {
      expect(result.current.add([file('a.jpg')], { size: 50 }).tooMany).toBe(false)
      expect(result.current.add([file('b.jpg'), file('c.jpg')], { size: 100 }).tooMany).toBe(true)
    })
    expect(run).toHaveBeenCalledTimes(1)
    expect(result.current.items.map((item) => item.status)).toEqual(['working', 'queued'])
    act(() => finishFirst(output('a-small.jpg')))
    await waitFor(() => expect(result.current.done).toHaveLength(2))
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[1]?.[0].settings).toEqual({ size: 100 })
    expect(result.current.done.map((item) => item.result?.name)).toEqual([
      'a-small.jpg',
      'b.jpg-100',
    ])
  })

  it('requeues with new settings and releases result URLs on requeue, clear and unmount', async () => {
    const run = vi.fn(async (item) => output(`${item.settings.size}.jpg`))
    const { result, unmount } = renderHook(() =>
      useFileQueue<{ size: number }, object>({ run, maxFiles: 2, validate: () => {} }),
    )
    act(() => result.current.add([file('a.jpg')], { size: 50 }))
    await waitFor(() => expect(result.current.done).toHaveLength(1))
    const id = result.current.done[0]?.id
    if (id === undefined) throw new Error('Missing queue item')
    act(() => result.current.requeue(new Set([id]), { size: 100 }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first')
    await waitFor(() => expect(result.current.done[0]?.result?.name).toBe('100.jpg'))
    act(() => result.current.clear())
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:next')
    expect(result.current.items).toEqual([])

    act(() => result.current.add([file('b.jpg')], { size: 50 }))
    await waitFor(() => expect(result.current.done).toHaveLength(1))
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledTimes(3)
  })

  it('ignores requeue for a file that is being processed', async () => {
    let finish = (_result: ToolResult) => {}
    const run = vi.fn(
      () =>
        new Promise<ToolResult>((resolve) => {
          finish = resolve
        }),
    )
    const { result } = renderHook(() =>
      useFileQueue<{ size: number }, object>({ run, maxFiles: 2, validate: () => {} }),
    )
    act(() => result.current.add([file('a.jpg')], { size: 50 }))
    await waitFor(() => expect(result.current.items[0]?.status).toBe('working'))
    const id = result.current.items[0]?.id
    if (id === undefined) throw new Error('Missing queue item')
    act(() => result.current.requeue(new Set([id]), { size: 100 }))
    expect(result.current.items[0]).toMatchObject({ status: 'working', settings: { size: 50 } })
    await act(async () => finish(output('a.jpg')))
    await waitFor(() => expect(result.current.done).toHaveLength(1))
    expect(run).toHaveBeenCalledOnce()
  })

  it('aborts the active file and cancels the files still waiting', async () => {
    const run = vi.fn(
      (_item, { signal }: { signal: AbortSignal }) =>
        new Promise<ToolResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new ToolError('aborted')), { once: true })
        }),
    )
    const { result } = renderHook(() =>
      useFileQueue<{ size: number }, object>({ run, maxFiles: 3, validate: () => {} }),
    )
    act(() => result.current.add([file('a.jpg'), file('b.jpg')], { size: 50 }))
    act(() => result.current.cancel())
    await waitFor(() =>
      expect(result.current.items.map((item) => item.status)).toEqual(['cancelled', 'cancelled']),
    )
    expect(run).toHaveBeenCalledTimes(1)
    expect(result.current.busy).toBe(false)
  })

  it('continues cancelled files with the settings they were added with', async () => {
    const run = vi.fn(
      (item, { signal }: { signal: AbortSignal }) =>
        new Promise<ToolResult>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new ToolError('aborted')), { once: true })
          if (run.mock.calls.length > 1) resolve(output(`${item.file.name}-${item.settings.size}`))
        }),
    )
    const { result } = renderHook(() =>
      useFileQueue<{ size: number }, object>({ run, maxFiles: 3, validate: () => {} }),
    )
    act(() => result.current.add([file('a.jpg'), file('b.jpg')], { size: 50 }))
    act(() => result.current.cancel())
    await waitFor(() => expect(result.current.busy).toBe(false))
    const cancelled = result.current.items.filter((item) => item.status === 'cancelled')
    act(() => result.current.requeue(new Set(cancelled.map((item) => item.id))))
    await waitFor(() => expect(result.current.done).toHaveLength(2))
    expect(result.current.done.map((item) => item.result?.name)).toEqual(['a.jpg-50', 'b.jpg-50'])
  })

  it('removes a waiting, a finished or the active file, and moves on to the next one', async () => {
    const finishers = new Map<string, () => void>()
    const run = vi.fn(
      (item, { signal }: { signal: AbortSignal }) =>
        new Promise<ToolResult>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new ToolError('aborted')), { once: true })
          finishers.set(item.file.name, () => resolve(output(item.file.name)))
        }),
    )
    const { result } = renderHook(() =>
      useFileQueue<{ size: number }, object>({ run, maxFiles: 4, validate: () => {} }),
    )
    act(() => result.current.add([file('a.jpg'), file('b.jpg'), file('c.jpg')], { size: 50 }))
    const [a, b, c] = result.current.items.map((item) => item.id)
    if (a === undefined || b === undefined || c === undefined) throw new Error('Missing items')

    act(() => result.current.remove(b))
    expect(result.current.items.map((item) => item.file.name)).toEqual(['a.jpg', 'c.jpg'])
    await act(async () => finishers.get('a.jpg')?.())
    await waitFor(() => expect(result.current.items[1]?.status).toBe('working'))

    // Removing the active file stops it; nothing is left running.
    act(() => result.current.remove(c))
    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(result.current.items.map((item) => item.file.name)).toEqual(['a.jpg'])

    act(() => result.current.remove(a))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first')
    expect(result.current.items).toEqual([])
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('creates no result URL for a file removed while it finishes', async () => {
    let finish = () => {}
    const run = vi.fn(
      () =>
        new Promise<ToolResult>((resolve) => {
          finish = () => resolve(output('a.jpg'))
        }),
    )
    const { result } = renderHook(() =>
      useFileQueue<{ size: number }, object>({ run, maxFiles: 2, validate: () => {} }),
    )
    act(() => result.current.add([file('a.jpg')], { size: 50 }))
    const id = result.current.items[0]?.id
    if (id === undefined) throw new Error('Missing queue item')
    // A run that ignores the abort still resolves after the row is gone.
    act(() => result.current.remove(id))
    await act(async () => finish())
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(result.current.items).toEqual([])
  })

  it('keeps files waiting while paused and starts them when it resumes', async () => {
    const run = vi.fn(async (item) => output(item.file.name))
    const { result, rerender } = renderHook(
      ({ paused }) =>
        useFileQueue<{ size: number }, object>({ run, maxFiles: 2, validate: () => {}, paused }),
      { initialProps: { paused: true } },
    )
    act(() => result.current.add([file('a.jpg')], { size: 50 }))
    expect(result.current.items[0]?.status).toBe('queued')
    expect(run).not.toHaveBeenCalled()
    rerender({ paused: false })
    await waitFor(() => expect(result.current.done).toHaveLength(1))
  })

  it('shows validation errors without running the worker', () => {
    const run = vi.fn()
    const { result } = renderHook(() =>
      useFileQueue<{ size: number }, object>({
        run,
        maxFiles: 2,
        validate: () => {
          throw new ToolError('unsupported-type')
        },
      }),
    )
    act(() => result.current.add([file('bad.jpg')], { size: 50 }))
    expect(result.current.items[0]?.error?.code).toBe('unsupported-type')
    expect(run).not.toHaveBeenCalled()
  })
})
