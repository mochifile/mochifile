import { cn } from '../cn.ts'

export interface ProgressBarProps {
  /**
   * Completion between 0 and 1. Leave it out when the work has no measurable progress (such
   * as preparing a tool): the bar is then indeterminate.
   */
  value?: number
  /** Accessible name, already translated, e.g. "Compressing photo.jpg". */
  label: string
  className?: string
}

const track = 'h-3 w-full overflow-hidden rounded-pill bg-line'

/**
 * A native `<progress>` element: accessible by default and styled without inline styles, which
 * the Content-Security-Policy forbids. Indeterminate, it is a `progressbar` with no value
 * (screen readers announce it as busy, never as a made-up percentage) whose segment slides
 * across while motion is allowed (README › Motion › Indeterminate progress).
 */
export function ProgressBar({ value, label, className }: ProgressBarProps) {
  if (value === undefined) {
    return (
      <div role="progressbar" aria-label={label} className={cn(track, className)}>
        <span className="block h-full w-1/3 rounded-pill bg-action motion-safe:animate-indeterminate" />
      </div>
    )
  }
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <progress
      max={100}
      value={percent}
      aria-label={label}
      className={cn(
        track,
        'appearance-none',
        '[&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:rounded-pill [&::-webkit-progress-value]:bg-action',
        '[&::-moz-progress-bar]:rounded-pill [&::-moz-progress-bar]:bg-action',
        className,
      )}
    >
      {percent}%
    </progress>
  )
}
