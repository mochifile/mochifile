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
        'h-2 w-full appearance-none overflow-hidden rounded-full bg-border',
        '[&::-webkit-progress-bar]:bg-border [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-accent',
        '[&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-accent',
        className,
      )}
    >
      {percent}%
    </progress>
  )
}
