import { cn } from '@mochifile/ui'
import type { ReactNode } from 'react'

/** Category tints (README › Colour): image tools mango, video and audio ube, PDF strawberry. */
const tints = {
  mango: 'bg-mango-tint text-mango-ink',
  ube: 'bg-ube-tint text-ube-ink',
  strawberry: 'bg-strawberry-tint text-strawberry-ink',
} as const

export interface FileTileProps {
  tint: keyof typeof tints
  /** A 24 px line icon, such as `ImageIcon`. */
  children: ReactNode
  className?: string
}

/** The icon square beside a file: category tint and `radius-md` (README › Iconography). */
export function FileTile({ tint, children, className }: FileTileProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        // Smaller on phones, so a row keeps its width for the name and result at 320 px.
        'flex size-10 shrink-0 items-center justify-center rounded-md sm:size-icon-tile',
        tints[tint],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A picture: 24 px line icon, 2 px stroke, round caps (README › Iconography). */
export function ImageIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-6 fill-none stroke-current stroke-2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17.5 5-5 3.5 3.5 2.5-2.5 4 4" />
    </svg>
  )
}
