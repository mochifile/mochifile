import { cn, Mascot } from '@mochifile/ui'
import type { ReactNode } from 'react'

/**
 * - `plain`: no block, just the text (if any) and the actions, e.g. for a single file.
 * - `working`: files are being prepared or processed; the mascot squishes on an ube tile.
 * - `ready`, `attention`, `cancelled`: the result banner of a finished batch, a matcha, mango
 *   or ube block (design-system proposal v1.1 › Result banner).
 */
export type BatchStatusTone = 'plain' | 'working' | 'ready' | 'attention' | 'cancelled'

export interface BatchStatusProps {
  tone: BatchStatusTone
  /** The main line, e.g. "Ready: 2 of 5" or the batch's summary. */
  title: string
  /** A quieter line under the title. */
  detail?: string
  /** A progress bar while working. */
  progress?: ReactNode
  /** Buttons: Cancel, Continue, Download all… */
  actions?: ReactNode
}

/** Whether the tone is a brand block: secondary buttons on it use `secondary-on-block`. */
export function isBlockTone(tone: BatchStatusTone): boolean {
  return tone === 'ready' || tone === 'attention' || tone === 'cancelled'
}

const grounds: Record<BatchStatusTone, string> = {
  plain: '',
  working: 'rounded-xl-squish-c bg-surface-page p-5 sm:p-6',
  // Text on any block is ink-on-block (README › Colour). The ready one bounces once.
  ready: 'rounded-xl-squish-c bg-matcha p-5 text-ink-on-block motion-safe:animate-ready sm:p-6',
  attention: 'rounded-xl-squish-c bg-mango p-5 text-ink-on-block sm:p-6',
  cancelled: 'rounded-xl-squish-c bg-ube p-5 text-ink-on-block sm:p-6',
}

const mascots = {
  plain: null,
  working: 'squish',
  ready: 'happy',
  attention: 'idle',
  cancelled: 'idle',
} as const

/**
 * The state of a tool's whole list, above its rows: counts and a bar while working, then one
 * summary with what to do next. The text is a polite live region that stays in the page across
 * every tone, so each change is announced once and focus never moves by itself (launch
 * specification › accessibility). One mascot for the region; rows then show none.
 */
export function BatchStatus({ tone, title, detail, progress, actions }: BatchStatusProps) {
  const mascot = mascots[tone]
  return (
    <div
      data-batch-status={tone}
      className={cn('flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-5', grounds[tone])}
    >
      {mascot && (
        // The mascot never sits directly on the page ground in dark mode: an ube tile while
        // working, the block itself for a banner (README › Mascot).
        <span
          className={cn(
            'w-fit shrink-0',
            tone === 'working' && 'rounded-lg-squish-a bg-ube px-3 py-2',
          )}
        >
          <Mascot state={mascot} className={tone === 'working' ? 'w-14' : 'w-16'} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div role="status" className="flex flex-col gap-1 empty:sr-only">
          {title && (
            <p className={tone === 'plain' ? 'type-body-strong' : 'type-title-sm'}>{title}</p>
          )}
          {detail && <p className="type-body-sm">{detail}</p>}
        </div>
        {progress}
      </div>
      {/* The buttons wrap rather than push the panel wider (three of them in Portuguese). */}
      {actions && <div className="flex flex-wrap gap-3 lg:justify-end">{actions}</div>}
    </div>
  )
}
