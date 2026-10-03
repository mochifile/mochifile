import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../cn.ts'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

const variants = {
  primary: 'bg-action text-action-ink',
  secondary: 'border border-border-control bg-surface-card text-ink hover:bg-mango-tint',
} as const

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-target-min items-center justify-center gap-2 rounded-pill px-5 font-medium transition-colors',
        'focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
