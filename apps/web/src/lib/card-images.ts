import { illustration } from './illustrations.ts'

/**
 * The illustrations of the three category cards (Images, PDFs, Video and audio) on Home and Ask,
 * and the Images one in the guide article's aside. Each is made from a 1.6 k px original at 720 px
 * (1x) and 1440 px (2x), so a Retina screen gets real detail at every card width (issue #78).
 * `srcset` lets the browser take the smaller file when it is enough; both carry their size, so the
 * box is reserved and nothing shifts.
 */
export type CardImage = 'images' | 'pdf' | 'video'

/** What a card is wide, per viewport: three columns, two from 1100 px, one from 640 px. */
export const CARD_IMAGE_SIZES =
  '(min-width: 1101px) 296px, (min-width: 641px) calc((100vw - 114px) / 2), calc(100vw - 76px)'

export function cardImage(name: CardImage, sizes: string = CARD_IMAGE_SIZES) {
  return illustration(`use-${name}`, sizes)
}
