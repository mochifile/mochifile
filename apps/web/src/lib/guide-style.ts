import type { GuideTopic } from './guides.ts'

/** One literal class per topic: Tailwind only generates classes it can read in the source. */
export const topicTone = {
  quick: 'bg-matcha-tint text-matcha-ink',
  forms: 'bg-mango-tint text-mango-ink',
  formats: 'bg-ube-tint text-ube-ink',
  performance: 'bg-ube-tint text-ube-ink',
  privacy: 'bg-strawberry-tint text-strawberry-ink',
  pdf: 'bg-strawberry-tint text-strawberry-ink',
  video: 'bg-matcha-tint text-matcha-ink',
  workflows: 'bg-matcha-tint text-matcha-ink',
} as const satisfies Record<GuideTopic, string>

/** Neighbouring cards vary their squish (design system README › Shape). */
export const cardSquish = ['rounded-card', 'rounded-card', 'rounded-card', 'rounded-card'] as const
