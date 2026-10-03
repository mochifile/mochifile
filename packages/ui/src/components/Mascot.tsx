import { cn } from '../cn.ts'

export type MascotState = 'idle' | 'squish' | 'happy' | 'error'

export interface MascotProps {
  state: MascotState
  className?: string
}

/*
 * The provisional mascot drawings from docs/design-system/assets/Mascot, inlined so they cost
 * no request and take their colours from the mochi-* tokens instead of hex values.
 */
const BODY = 'M22 30 Q22 12 40 12 L80 12 L102 34 L102 76 Q104 99 80 100 L38 100 Q16 99 18 78 Z'
const CORNER = 'M80 12 L80 26 Q80 34 88 34 L102 34 Z'
const SQUISHED_BODY =
  'M16 46 Q16 30 34 30 L112 30 L134 48 L134 70 Q136 90 112 90 L36 90 Q14 90 14 72 Z'
const SQUISHED_CORNER = 'M112 30 L112 40 Q112 48 120 48 L134 48 Z'

const shape = 'fill-mochi-body stroke-mochi-outline'
const corner = 'fill-ube stroke-mochi-outline'
const line = 'fill-none stroke-mochi-outline'

function Face({ state }: { state: Exclude<MascotState, 'squish'> }) {
  const cheeks = (
    <>
      <ellipse cx="37" cy="69" rx="7" ry="4.5" className="fill-mochi-blush" />
      <ellipse cx="85" cy="69" rx="7" ry="4.5" className="fill-mochi-blush" />
    </>
  )
  if (state === 'happy') {
    return (
      <>
        <path d="M40 60 Q46 52 52 60" strokeWidth="4" strokeLinecap="round" className={line} />
        <path d="M70 60 Q76 52 82 60" strokeWidth="4" strokeLinecap="round" className={line} />
        {cheeks}
        <path
          d="M52 68 Q61 80 70 68 Z"
          strokeWidth="3"
          strokeLinejoin="round"
          className="fill-mochi-outline stroke-mochi-outline"
        />
      </>
    )
  }
  return (
    <>
      <circle cx="46" cy="58" r="5" className="fill-mochi-outline" />
      <circle cx="76" cy="58" r="5" className="fill-mochi-outline" />
      {state === 'error' && (
        <path d="M38 46 L52 50" strokeWidth="3.5" strokeLinecap="round" className={line} />
      )}
      {cheeks}
      <path
        d={state === 'error' ? 'M54 72 Q58 68 62 72 Q66 76 70 72' : 'M56 68 Q61 71 66 68'}
        strokeWidth="3.5"
        strokeLinecap="round"
        className={line}
      />
    </>
  )
}

/**
 * The Mochifile mascot (provisional, see the design system README › Mascot). Decorative:
 * hidden from assistive technology, so the text beside it must carry the meaning. Use at most
 * one per screen region, on a light ground or a brand block.
 */
export function Mascot({ state, className }: MascotProps) {
  if (state === 'squish') {
    return (
      <svg viewBox="0 0 150 100" aria-hidden="true" className={cn('shrink-0', className)}>
        <path d={SQUISHED_BODY} strokeWidth="5" strokeLinejoin="round" className={shape} />
        <path d={SQUISHED_CORNER} strokeWidth="5" strokeLinejoin="round" className={corner} />
        <path
          d="M54 62 L62 66 L54 70"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={line}
        />
        <path
          d="M96 62 L88 66 L96 70"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={line}
        />
        <ellipse cx="44" cy="76" rx="7" ry="4" className="fill-mochi-blush" />
        <ellipse cx="106" cy="76" rx="7" ry="4" className="fill-mochi-blush" />
        <path d="M70 76 Q75 79 80 76" strokeWidth="3.5" strokeLinecap="round" className={line} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 120 110" aria-hidden="true" className={cn('shrink-0', className)}>
      <path d={BODY} strokeWidth="5" strokeLinejoin="round" className={shape} />
      <path d={CORNER} strokeWidth="5" strokeLinejoin="round" className={corner} />
      <Face state={state} />
    </svg>
  )
}
