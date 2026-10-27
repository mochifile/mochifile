import type { ReactNode } from 'react'

export interface PrivacyNoteProps {
  /** The promise, in bold: "Your photos never leave your device." */
  lead: string
  /** What follows it, in the muted text colour. */
  children?: ReactNode
}

/**
 * The privacy line at the foot of a tool panel (launch specification, ToolPanel artboard: the
 * "privacy indicator, always"): a lock, the promise in bold and the detail after it, below a
 * `line` divider, in every state of the panel.
 */
export function PrivacyNote({ lead, children }: PrivacyNoteProps) {
  return (
    <p className="flex items-start gap-3 border-t border-line pt-4 type-body-sm text-ink-muted sm:pt-5">
      {/* Line icon on the 24px grid, 2px stroke (README › Iconography). */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5 shrink-0 fill-none stroke-current stroke-2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z" />
      </svg>
      <span>
        <strong className="font-bold text-ink">{lead}</strong>
        {children && <> {children}</>}
      </span>
    </p>
  )
}
