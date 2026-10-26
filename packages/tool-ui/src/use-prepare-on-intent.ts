import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

export type PrepareState = 'idle' | 'loading' | 'ready' | 'failed'

export interface PrepareOnIntent {
  /** Attach to the tool's root: any sign of intent inside it starts loading. */
  rootRef: RefObject<HTMLDivElement | null>
  /**
   * `idle`, `loading`, `ready` or `failed`; tools expose it as `data-engine` (end-to-end tests
   * wait on it). `failed` means loading failed after the person showed intent: the tool says so
   * and offers to try again.
   */
  state: PrepareState
  /**
   * Starts loading now, e.g. when files arrive or the person asks to try again. Does nothing
   * while loading or once ready; after a failure it tries again.
   */
  prepare: () => void
}

/**
 * Loads a tool's worker and codecs on the first sign of intent (pointer, keyboard focus, touch,
 * drag) or when the page is idle, so nothing is fetched after a file is chosen (ADR 0016).
 * Listeners are passive: they only observe, so they never delay scrolling or typing.
 *
 * A failed idle preload stays silent and is retried on the next sign of intent: nobody asked
 * for the tool yet. Once the person has shown intent, a failure becomes `failed`, and only an
 * explicit `prepare()` (a "Try again" button, or adding files) tries again, so hovering over
 * the message does not keep refetching.
 */
export function usePrepareOnIntent({
  load,
  preloadOnIdle,
}: {
  /** Loads everything the tool needs; may reject (offline, blocked, worker failed). */
  load: () => Promise<void>
  /** Whether loading may start without intent (false on Save-Data or slow connections). */
  preloadOnIdle: () => boolean
}): PrepareOnIntent {
  const [state, setState] = useState<PrepareState>('idle')
  const rootRef = useRef<HTMLDivElement>(null)
  // Callers may pass inline functions; read the latest ones without re-running the effects.
  const loadRef = useRef(load)
  loadRef.current = load
  const preloadOnIdleRef = useRef(preloadOnIdle)
  preloadOnIdleRef.current = preloadOnIdle

  // A ref guards the state so two events in the same tick cannot both call `load`.
  const stateRef = useRef<PrepareState>('idle')
  // Whether the person has shown intent: only then is a failure worth telling them about.
  const wantedRef = useRef(false)
  const update = useCallback((next: PrepareState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const start = useCallback(() => {
    update('loading')
    loadRef.current().then(
      () => update('ready'),
      () => update(wantedRef.current ? 'failed' : 'idle'),
    )
  }, [update])

  const prepare = useCallback(() => {
    wantedRef.current = true
    if (stateRef.current === 'idle' || stateRef.current === 'failed') start()
  }, [start])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    // Intent during an idle preload marks it as wanted, so its failure is shown.
    const onIntent = () => {
      wantedRef.current = true
      if (stateRef.current === 'idle') start()
    }
    const events = ['pointerover', 'focusin', 'touchstart', 'dragenter'] as const
    for (const event of events) root.addEventListener(event, onIntent, { passive: true })
    return () => {
      for (const event of events) root.removeEventListener(event, onIntent)
    }
  }, [start])

  // `start` is stable, so this runs once: a failed idle load waits for the next intent event.
  useEffect(() => {
    if (!preloadOnIdleRef.current()) return
    const preload = () => {
      if (stateRef.current === 'idle') start()
    }
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(preload, { timeout: 4000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(preload, 1500)
    return () => clearTimeout(id)
  }, [start])

  return { rootRef, state, prepare }
}
