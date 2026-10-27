import { cn } from '@mochifile/ui'
import { type ReactNode, useId, useState } from 'react'

export interface OptionListProps {
  /** `OptionRow`s. */
  children: ReactNode
  className?: string
}

/**
 * The tool's options as a compact list on phones (design-system proposal v1.1 › Phone option
 * list): one row per option, "label · value · Change", on `surface-sunken` with `line`
 * dividers, so the primary action stays high on a 360 × 800 screen. From 600 px it adds
 * nothing: the rows show their full controls as before.
 */
export function OptionList({ children, className }: OptionListProps) {
  return (
    <div
      className={cn(
        'flex flex-col max-sm:divide-y max-sm:divide-line max-sm:rounded-lg-squish-a max-sm:bg-surface-sunken max-sm:px-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

export interface OptionRowProps {
  /** What the option is, e.g. "Maximum size". */
  label: string
  /** Its current value, e.g. "50 KB". */
  value: string
  /** The disclosure's verb, e.g. "Change". */
  change: string
  /** The option's full control (chips, segmented choice…), unchanged from wider screens. */
  children: ReactNode
  className?: string
}

/**
 * One option of an `OptionList`. On phones a button names the option, its value and "Change"
 * ("Maximum size, 50 KB, Change") and opens the control in place, below it, with no sideways
 * scrolling; focus stays on the button when it closes. From 600 px the button is gone and the
 * control always shows.
 */
export function OptionRow({ label, value, change, children, className }: OptionRowProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <div className={cn('flex flex-col', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        // The visible words, in order, with pauses between them: the label stays in the name.
        aria-label={`${label}, ${value}, ${change}`}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-target-min items-center gap-3 rounded-sm py-2 text-start focus-ring sm:hidden"
      >
        {/* The label keeps its width; a long value wraps instead, aligned to the end. */}
        <span className="shrink-0 type-body-sm text-ink-muted">{label}</span>
        <span className="min-w-0 flex-1 text-end type-body-strong">{value}</span>
        <span className="shrink-0 type-body-sm font-semibold underline">{change}</span>
      </button>
      <div id={panelId} className={cn(open ? 'max-sm:pb-4' : 'max-sm:hidden')}>
        {children}
      </div>
    </div>
  )
}
