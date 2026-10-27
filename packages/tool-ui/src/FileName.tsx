import { cn } from '@mochifile/ui'

/** Longest ending kept visible as an extension: ".jpeg", ".webp"; longer means no extension. */
const MAX_EXTENSION = 5

export interface FileNameProps {
  name: string
  className?: string
}

/**
 * A file name on one line. A long name is cut in the middle with "…" and its extension always
 * stays visible ("formatura-turma-3o-a….jpg"), so people can tell their files apart (launch
 * specification › long file names). The cut is CSS only; the full name is in the page for
 * screen readers and in `title` for a pointer.
 */
export function FileName({ name, className }: FileNameProps) {
  const dot = name.lastIndexOf('.')
  const split = dot > 0 && name.length - dot - 1 <= MAX_EXTENSION
  const stem = split ? name.slice(0, dot) : name
  const extension = split ? name.slice(dot) : ''
  return (
    <span title={name} className={cn('flex min-w-0', className)}>
      <span className="sr-only">{name}</span>
      <span aria-hidden="true" className="min-w-0 truncate">
        {stem}
      </span>
      <span aria-hidden="true" className="shrink-0">
        {extension}
      </span>
    </span>
  )
}
