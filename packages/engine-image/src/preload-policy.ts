/**
 * When to preload the image engine. Separate from the engine so a tool's UI can import it
 * without pulling the codecs into the page bundle.
 */

/** The parts of `navigator` the idle-preload policy reads. */
export interface NavigatorLike {
  connection?: { saveData?: boolean; effectiveType?: string }
}

/**
 * Whether to preload the engine (~300 KB of WebAssembly) while the page is idle, before any
 * sign of intent. Not on connections where the visitor asked to save data or that are very
 * slow. Browsers without the Network Information API (Safari, Firefox) preload. Preloading on
 * intent (pointer, focus, touch, drag on the tool) always happens regardless (ADR 0016).
 */
export function shouldPreloadOnIdle(navigator: NavigatorLike): boolean {
  const connection = navigator.connection
  if (!connection) return true
  if (connection.saveData === true) return false
  return connection.effectiveType !== '2g' && connection.effectiveType !== 'slow-2g'
}
