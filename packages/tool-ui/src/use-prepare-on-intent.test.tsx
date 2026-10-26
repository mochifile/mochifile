import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePrepareOnIntent } from './use-prepare-on-intent.ts'

afterEach(cleanup)

function Harness({
  load,
  preloadOnIdle,
}: {
  load: () => Promise<void>
  preloadOnIdle: () => boolean
}) {
  const { rootRef, state, prepare } = usePrepareOnIntent({ load, preloadOnIdle })
  return (
    <div ref={rootRef} data-testid="tool" data-engine={state}>
      <button type="button" onClick={prepare}>
        Try again
      </button>
    </div>
  )
}

const engine = () => screen.getByTestId('tool').getAttribute('data-engine')

describe('usePrepareOnIntent', () => {
  it('waits when idle preloading is disabled, then prepares once on intent', async () => {
    const load = vi.fn(async () => {})
    render(<Harness load={load} preloadOnIdle={() => false} />)
    expect(engine()).toBe('idle')
    expect(load).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.focusIn(screen.getByTestId('tool'))
    })
    expect(engine()).toBe('ready')
    fireEvent.pointerOver(screen.getByTestId('tool'))
    expect(load).toHaveBeenCalledOnce()
  })

  it('reports a failure after intent and tries again only when asked', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    render(<Harness load={load} preloadOnIdle={() => false} />)
    await act(async () => {
      fireEvent.pointerOver(screen.getByTestId('tool'))
    })
    expect(engine()).toBe('failed')
    // Moving the pointer over the message does not refetch.
    await act(async () => {
      fireEvent.pointerOver(screen.getByTestId('tool'))
      fireEvent.dragEnter(screen.getByTestId('tool'))
    })
    expect(load).toHaveBeenCalledOnce()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    })
    expect(engine()).toBe('ready')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps a failed idle preload silent and retries it on intent', async () => {
    vi.useFakeTimers()
    try {
      const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
      render(<Harness load={load} preloadOnIdle={() => true} />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(load).toHaveBeenCalledOnce()
      expect(engine()).toBe('idle')
      await act(async () => {
        fireEvent.focusIn(screen.getByTestId('tool'))
      })
      expect(engine()).toBe('ready')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports the failure of an idle preload the person showed intent during', async () => {
    let fail = (_error: Error) => {}
    const load = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject
        }),
    )
    vi.useFakeTimers()
    try {
      render(<Harness load={load} preloadOnIdle={() => true} />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(engine()).toBe('loading')
      fireEvent.pointerOver(screen.getByTestId('tool'))
      await act(async () => fail(new Error('offline')))
      expect(engine()).toBe('failed')
      expect(load).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('calls load once when two events arrive in the same tick', async () => {
    const load = vi.fn(async () => {})
    render(<Harness load={load} preloadOnIdle={() => false} />)
    await act(async () => {
      fireEvent.pointerOver(screen.getByTestId('tool'))
      fireEvent.focusIn(screen.getByTestId('tool'))
    })
    expect(load).toHaveBeenCalledOnce()
  })

  it('preloads on idle only once, even after the load fails', async () => {
    vi.useFakeTimers()
    try {
      const load = vi.fn().mockRejectedValue(new Error('offline'))
      render(<Harness load={load} preloadOnIdle={() => true} />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(load).toHaveBeenCalledOnce()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(load).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
