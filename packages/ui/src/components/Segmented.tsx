import { useId } from 'react'
import { cn } from '../cn.ts'
import { type ChoiceOption, stepLegendClasses } from './SizeChips.tsx'

export interface SegmentedOption<T extends string> extends ChoiceOption<T> {
  /** One line shown under the control while this option is selected, already translated. */
  hint?: string
}

export interface SegmentedProps<T extends string> {
  legend: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
}

/**
 * A few short, mutually exclusive options in one row (the SizeChip README's segmented variant),
 * e.g. the output format. Real radios underneath; the selected option's hint is shown below and
 * read with the group.
 */
export function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
  disabled,
  className,
}: SegmentedProps<T>) {
  const name = useId()
  const hintId = useId()
  const hint = options.find((option) => option.value === value)?.hint
  return (
    <fieldset className={className} disabled={disabled} aria-describedby={hintId}>
      <legend className={stepLegendClasses}>{legend}</legend>
      <div className="flex gap-1 rounded-md bg-surface-page p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'press flex min-h-target-min flex-auto cursor-pointer items-center justify-center rounded-sm px-3 text-center type-body-sm font-semibold text-ink',
              'hover:bg-surface-sunken has-checked:bg-action has-checked:font-bold has-checked:text-action-ink',
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
            {option.label}
          </label>
        ))}
      </div>
      <p id={hintId} className="mt-2 type-body-sm text-ink-muted">
        {hint}
      </p>
    </fieldset>
  )
}
