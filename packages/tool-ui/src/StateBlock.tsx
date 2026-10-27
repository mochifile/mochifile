import { Mascot, type MascotState } from '@mochifile/ui'
import type { ReactNode } from 'react'

export interface StateBlockProps {
  mascot: MascotState
  /** What happened and what to do next. Announced as an alert. */
  children: ReactNode
  /** The way out, e.g. a "Try again" button. Kept outside the alert. */
  action?: ReactNode
}

/**
 * A tool state that replaces the usual flow, such as "the compressor did not load"
 * (design-system proposal v1.1 › State block): the mascot on a mango disc, the text, and one
 * action, on `surface-sunken`.
 */
export function StateBlock({ mascot, children, action }: StateBlockProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl-squish-b bg-surface-sunken p-5 sm:flex-row sm:items-start sm:p-6">
      <span className="w-fit shrink-0 rounded-pill bg-mango p-3">
        <Mascot state={mascot} className="w-10" />
      </span>
      <div className="flex min-w-0 flex-col gap-4">
        <div role="alert" className="type-body">
          {children}
        </div>
        {action}
      </div>
    </div>
  )
}
