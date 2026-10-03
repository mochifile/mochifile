import { cn } from '../cn.ts'

export interface ProgressBarProps {
  /** Completion between 0 and 1. */
  value: number
  /** Accessible name, already translated, e.g. "Compressing photo.jpg". */
  label: string
  className?: string
}

/**
 * A native `<progress>` element: accessible by default and styled without inline styles, which
 * the Content-Security-Policy forbids.
 */
export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <progress
      max={100}
      value={percent}
      aria-label={label}
      className={cn(
        'h-3 w-full appearance-none overflow-hidden rounded-pill bg-line',
        '[&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:rounded-pill [&::-webkit-progress-value]:bg-action',
        '[&::-moz-progress-bar]:rounded-pill [&::-moz-progress-bar]:bg-action',
        className,
      )}
    >
      {percent}%
    </progress>
  )
}
