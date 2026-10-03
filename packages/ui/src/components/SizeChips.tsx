import { useId } from 'react'
import { cn } from '../cn.ts'

/** The tool categories' identity blocks (README › Colour › category mapping). */
export type BlockColor = 'mango' | 'ube' | 'strawberry'

export interface ChoiceOption<T extends string> {
  value: T
  /** Text of the option, already translated. */
  label: string
}

export interface SizeChipsProps<T extends string> {
  /** Question the choice answers, already translated. Rendered as the group's legend. */
  legend: string
  options: readonly ChoiceOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Fill of the selected chip: the tool category's block colour. */
  block?: BlockColor
  /** `card` inside the tool panel (chips on `surface-page`), `page` directly on the page. */
  on?: 'card' | 'page'
  disabled?: boolean
  className?: string
}

const selected = {
  mango: 'has-checked:bg-mango',
  ube: 'has-checked:bg-ube',
  strawberry: 'has-checked:bg-strawberry',
} as const

/** Shared legend style of the tool panel's numbered steps. */
export const stepLegendClasses = 'mb-2 type-label-lg text-ink'

/**
 * A single choice shown as squished chips (docs/design-system/components/SizeChip). Real radio
 * inputs in a fieldset, so arrow keys move the choice and the checked state is announced.
 */
export function SizeChips<T extends string>({
  legend,
  options,
  value,
  onChange,
  block = 'mango',
  on = 'card',
  disabled,
  className,
}: SizeChipsProps<T>) {
  const name = useId()
  // Neighbours get different corner patterns so the row does not look stamped.
  const squish = ['rounded-md-squish-a', 'rounded-md-squish-b', 'rounded-md-squish-c'] as const
  return (
    <fieldset className={className} disabled={disabled}>
      <legend className={stepLegendClasses}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => (
          <label
            key={option.value}
            className={cn(
              'press flex min-h-target-min cursor-pointer items-center border-chip border-border-control px-3 type-body-sm font-semibold text-ink',
              squish[index % squish.length],
              on === 'card' ? 'bg-surface-page' : 'bg-surface-card',
              'hover:border-ink has-checked:border-ink has-checked:font-bold has-checked:text-ink-on-block',
              selected[block],
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
    </fieldset>
  )
}
