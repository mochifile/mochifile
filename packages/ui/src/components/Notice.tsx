import type { ReactNode } from 'react'
import { cn } from '../cn.ts'

export interface NoticeProps {
  tone?: 'info' | 'success' | 'warning'
  children: ReactNode
  className?: string
}

const tones = {
  info: 'border-line bg-surface-card',
  success: 'border-ink bg-mango-tint',
  warning: 'border-ink bg-surface-card font-medium',
} as const

/** A short message about a result or a choice. Announce changes with an `aria-live` parent. */
export function Notice({ tone = 'info', children, className }: NoticeProps) {
  return (
    <p className={cn('rounded-md border px-3 py-2 type-body-sm text-ink', tones[tone], className)}>
      {children}
    </p>
  )
}
