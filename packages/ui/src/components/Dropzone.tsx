import { type DragEvent, useId, useState } from 'react'
import { cn } from '../cn.ts'

export interface DropzoneProps {
  /** Called with the chosen files. Filtering and validation are the caller's job. */
  onFiles: (files: File[]) => void
  /** Value for the input's `accept` attribute, e.g. `image/*`. */
  accept?: string
  multiple?: boolean
  disabled?: boolean
  /** Main call to action, already translated. */
  label: string
  /** Secondary line, already translated, e.g. accepted formats and limits. */
  hint?: string
}

/**
 * File picker that also accepts drag and drop. It is a real `<input type="file">` behind a
 * `<label>`, so it works with keyboard, screen readers and mobile pickers.
 */
export function Dropzone({ onFiles, accept, multiple, disabled, label, hint }: DropzoneProps) {
  const id = useId()
  const [dragging, setDragging] = useState(false)

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    if (disabled) return
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1))
  }

  return (
    <label
      htmlFor={id}
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-strong border-dashed border-border-dashed bg-surface-card px-8 py-10 text-center transition-colors',
        'has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring',
        dragging && 'border-ink bg-mango-tint',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="type-label-lg text-ink">{label}</span>
      {hint ? <span className="type-body-sm text-ink-muted">{hint}</span> : null}
      <input
        id={id}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          if (files.length > 0) onFiles(files)
          // Allow choosing the same file again.
          event.currentTarget.value = ''
        }}
      />
    </label>
  )
}
