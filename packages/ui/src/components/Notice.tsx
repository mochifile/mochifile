import type { ReactNode } from 'react'
import { cn } from '../cn.ts'

export interface NoticeProps {
  tone?: 'info' | 'success' | 'warning'
  children: ReactNode
  className?: string
}

const tones = {
  info: 'border-border bg-surface-raised',
  success: 'border-accent bg-accent-soft',
  warning: 'border-accent bg-surface-raised font-medium',
} as const

/** A short message about a result or a choice. Announce changes with an `aria-live` parent. */
export function Notice({ tone = 'info', children, className }: NoticeProps) {
  return (
    <p className={cn('rounded-control border px-3 py-2 text-sm text-text', tones[tone], className)}>
      {children}
    </p>
  )
}
