import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../cn.ts'

export type ButtonVariant = 'primary' | 'secondary'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variants = {
  primary: 'bg-action text-action-ink',
  secondary: 'border-strong border-ink bg-transparent text-ink',
} as const

/**
 * Classes of a pill button (docs/design-system/components/Button). Exported for links that look
 * like buttons, such as a download link.
 */
export function buttonClasses(variant: ButtonVariant = 'primary', className?: string): string {
  return cn(
    'inline-flex min-h-target-primary items-center justify-center gap-2 rounded-pill px-6 text-center type-label-lg',
    'press focus-ring',
    'disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    className,
  )
}

/** One primary action per step, in the action colour; secondary actions are outlined. */
export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />
}
