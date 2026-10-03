import { type DragEvent, useEffect, useId, useRef, useState } from 'react'
import { cn } from '../cn.ts'
import { buttonClasses } from './Button.tsx'
import { Mascot } from './Mascot.tsx'

export interface DropzoneProps {
  /** Called with the chosen files. Filtering and validation are the caller's job. */
  onFiles: (files: File[]) => void
  /** Value for the input's `accept` attribute, e.g. `image/*`. */
  accept?: string
  multiple?: boolean
  disabled?: boolean
  /** Numbered step label, already translated, e.g. "3. Choose your photos". */
  stepLabel?: string
  /** Text of the primary button, already translated, e.g. "Choose photos". */
  label: string
  /** Secondary line, already translated, e.g. accepted formats and limits. */
  hint?: string
  /**
   * Line shown on wider screens only, already translated, e.g. "Or drop them here, or paste
   * with Ctrl+V". When set, files pasted anywhere on the page are taken too.
   */
  pasteHint?: string
}

/**
 * The file drop area (docs/design-system/components/Dropzone). A real `<input type="file">`
 * inside a `<label>`, so the whole area opens the picker and works with keyboard, screen
 * readers and phone galleries; the pill is the visible button and carries the focus ring.
 * Files can also be dropped here or, with `pasteHint`, pasted anywhere on the page.
 */
export function Dropzone({
  onFiles,
  accept,
  multiple,
  disabled,
  stepLabel,
  label,
  hint,
  pasteHint,
}: DropzoneProps) {
  const id = useId()
  const labelId = useId()
  const hintId = useId()
  const [dragging, setDragging] = useState(false)
  const take = (files: File[]) => {
    if (!disabled && files.length > 0) onFiles(multiple ? files : files.slice(0, 1))
  }
  // The paste listener lives on the document; read the latest props through a ref.
  const takeRef = useRef(take)
  takeRef.current = take

  const pasteEnabled = pasteHint !== undefined && !disabled
  useEffect(() => {
    if (!pasteEnabled) return
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? [])
      // Text pasted into a field is left alone; only files are taken.
      if (files.length === 0) return
      event.preventDefault()
      takeRef.current(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [pasteEnabled])

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    take(Array.from(event.dataTransfer.files))
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
        'group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl-squish-a border-strong border-dashed border-border-dashed bg-surface-sunken px-5 py-5 text-center sm:px-8 sm:py-8',
        dragging && 'border-solid border-ink bg-mango-tint motion-safe:animate-squish',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {/* The mascot never sits directly on a dark ground: it gets a brand-block disc. */}
      <span className="hidden rounded-pill bg-mango p-3 lg:block">
        <Mascot state="idle" className="w-14" />
      </span>
      {stepLabel ? <span className="type-title-sm text-ink">{stepLabel}</span> : null}
      <span
        id={labelId}
        data-primary-action
        className={buttonClasses(
          'primary',
          'w-full sm:w-auto group-has-focus-visible:outline-3 group-has-focus-visible:outline-offset-2 group-has-focus-visible:outline-focus-ring',
        )}
      >
        {label}
      </span>
      {hint ? (
        <span id={hintId} className="type-body-sm text-ink-muted">
          {hint}
        </span>
      ) : null}
      {pasteHint ? (
        <span className="hidden type-body-sm text-ink-muted lg:block">{pasteHint}</span>
      ) : null}
      <input
        id={id}
        type="file"
        className="sr-only"
        aria-labelledby={labelId}
        {...(hint ? { 'aria-describedby': hintId } : {})}
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
