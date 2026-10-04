import type { Page } from '@playwright/test'

/**
 * Records layout shifts from the start of the page's life (Chromium only: other engines have
 * no layout-shift entries). Call before `page.goto`.
 */
export async function recordLayoutShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Shift = { value: number; moved: string[] }
    const shifts: Shift[] = []
    ;(window as unknown as { __shifts: Shift[] }).__shifts = shifts
    /** What moved, so a failure says where to look, e.g. `A «Home» x24→26 y92→92`. */
    const describe = (source: {
      node?: Node | null
      previousRect: DOMRectReadOnly
      currentRect: DOMRectReadOnly
    }) => {
      const node = source.node
      const text = (node?.textContent ?? '').trim().slice(0, 30)
      const { previousRect: a, currentRect: b } = source
      return `${node?.nodeName ?? '?'} «${text}» x${a.x}→${b.x} y${a.y}→${b.y} w${a.width}→${b.width}`
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as unknown as {
            value: number
            sources: Parameters<typeof describe>[0][]
          }
          shifts.push({ value: shift.value, moved: shift.sources.map(describe) })
        }
      }).observe({ type: 'layout-shift', buffered: true })
    } catch {
      // layout-shift entries exist only in Chromium.
    }
  })
}

/** Total layout shift so far, and what moved, e.g. `A «Home» x24→26 y92→92`. */
export async function readLayoutShifts(page: Page): Promise<{ total: number; moved: string }> {
  const shifts = await page.evaluate(
    () => (window as unknown as { __shifts: { value: number; moved: string[] }[] }).__shifts,
  )
  return {
    total: shifts.reduce((sum, shift) => sum + shift.value, 0),
    moved: shifts.flatMap((shift) => shift.moved).join('; '),
  }
}
