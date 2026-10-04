import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

export type PrepareState = 'idle' | 'loading' | 'ready'

export interface PrepareOnIntent {
  /** Attach to the tool's root: any sign of intent inside it starts loading. */
  rootRef: RefObject<HTMLDivElement | null>
  /** `idle`, `loading` or `ready`; tools expose it as `data-engine` (end-to-end tests wait on it). */
  state: PrepareState
  /** Starts loading now, e.g. when files arrive. Does nothing once loading has started. */
  prepare: () => void
}

/**
 * Loads a tool's worker and codecs on the first sign of intent (pointer, keyboard focus, touch,
 * drag) or when the page is idle, so nothing is fetched after a file is chosen (ADR 0016).
 * Listeners are passive: they only observe, so they never delay scrolling or typing.
 */
export function usePrepareOnIntent({
  load,
  preloadOnIdle,
}: {
  /** Loads everything the tool needs; a rejection is retried on the next sign of intent. */
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

  const prepare = useCallback(() => {
    if (state !== 'idle') return
    setState('loading')
    loadRef.current().then(
      () => setState('ready'),
      // A failed preparation (e.g. offline) is retried on the next sign of intent.
      () => setState('idle'),
    )
  }, [state])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const events = ['pointerover', 'focusin', 'touchstart', 'dragenter'] as const
    for (const event of events) root.addEventListener(event, prepare, { passive: true })
    return () => {
      for (const event of events) root.removeEventListener(event, prepare)
    }
  }, [prepare])

  useEffect(() => {
    if (!preloadOnIdleRef.current()) return
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(prepare, { timeout: 4000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(prepare, 1500)
    return () => clearTimeout(id)
  }, [prepare])

  return { rootRef, state, prepare }
}
