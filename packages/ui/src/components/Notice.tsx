import type { ReactNode } from 'react'
import { cn } from '../cn.ts'

/** Meaning of a notice or tag (docs/design-system/components/Notice). */
export type Tone = 'info' | 'success' | 'warning' | 'danger'

const colors = {
  info: 'bg-ube-tint text-ube-ink',
  success: 'bg-matcha-tint text-matcha-ink',
  warning: 'bg-warning-tint text-warning-ink',
  danger: 'bg-danger-tint text-danger-ink',
} as const

/** 24 px line icons, 2 px stroke, round caps (README › Iconography). */
const icons: Record<Tone, ReactNode> = {
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </>
  ),
  danger: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </>
  ),
}

export interface NoticeProps {
  tone?: Tone
  children: ReactNode
  className?: string
}

/**
 * A sentence about a result or a choice, with an icon. Errors always say what to do next.
 * Announce new notices with an `aria-live="polite"` parent.
 */
export function Notice({ tone = 'info', children, className }: NoticeProps) {
  return (
    <div
      className={cn('flex items-start gap-3 rounded-lg p-4 type-body-sm', colors[tone], className)}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-button-icon shrink-0 fill-none stroke-current stroke-2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icons[tone]}
      </svg>
      <p className="min-w-0">{children}</p>
    </div>
  )
}

export interface TagProps {
  tone?: Tone
  children: ReactNode
  className?: string
}

/** One short fact about a result, such as "Metadata removed". */
export function Tag({ tone = 'info', children, className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-3 py-1 type-body-sm font-semibold',
        colors[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
