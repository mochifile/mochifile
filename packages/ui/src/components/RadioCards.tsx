import { useId } from 'react'
import { cn } from '../cn.ts'

export interface RadioCardOption<T extends string> {
  value: T
  /** Main text, already translated. */
  label: string
  /** Optional second line, already translated. */
  description?: string
}

export interface RadioCardsProps<T extends string> {
  /** Question the choice answers, already translated. Rendered as the group's legend. */
  legend: string
  options: readonly RadioCardOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
}

/**
 * A single choice shown as large, tappable cards. Real radio inputs underneath, so arrow keys,
 * screen readers and forms work as people expect.
 */
export function RadioCards<T extends string>({
  legend,
  options,
  value,
  onChange,
  disabled,
  className,
}: RadioCardsProps<T>) {
  const name = useId()
  return (
    <fieldset className={cn('flex flex-col gap-2', className)} disabled={disabled}>
      <legend className="mb-2 font-semibold text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'group flex min-h-target-min cursor-pointer flex-col justify-center rounded-md border border-border-control bg-surface-card px-4 py-2 transition-colors',
              'hover:border-ink has-checked:border-ink has-checked:bg-mango has-checked:font-semibold',
              'has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring',
              'has-disabled:cursor-not-allowed has-disabled:opacity-50',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className="text-ink">{option.label}</span>
            {option.description ? (
              // Muted grey is too faint on the selected card's tint (WCAG contrast).
              <span className="type-body-sm font-normal text-ink-muted group-has-checked:text-ink">
                {option.description}
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
