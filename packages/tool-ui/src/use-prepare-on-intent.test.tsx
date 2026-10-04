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
  const { rootRef, state } = usePrepareOnIntent({ load, preloadOnIdle })
  return <div ref={rootRef} data-testid="tool" data-engine={state} />
}

describe('usePrepareOnIntent', () => {
  it('waits when idle preloading is disabled, then prepares once on intent', async () => {
    const load = vi.fn(async () => {})
    render(<Harness load={load} preloadOnIdle={() => false} />)
    expect(screen.getByTestId('tool').getAttribute('data-engine')).toBe('idle')
    expect(load).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.focusIn(screen.getByTestId('tool'))
    })
    expect(screen.getByTestId('tool').getAttribute('data-engine')).toBe('ready')
    fireEvent.pointerOver(screen.getByTestId('tool'))
    expect(load).toHaveBeenCalledOnce()
  })

  it('retries after preparation fails on another sign of intent', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    render(<Harness load={load} preloadOnIdle={() => false} />)
    await act(async () => {
      fireEvent.pointerOver(screen.getByTestId('tool'))
    })
    expect(screen.getByTestId('tool').getAttribute('data-engine')).toBe('idle')
    await act(async () => {
      fireEvent.dragEnter(screen.getByTestId('tool'))
    })
    expect(screen.getByTestId('tool').getAttribute('data-engine')).toBe('ready')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
