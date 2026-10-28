import images1x from '../assets/cards/use-images-1x.webp'
import images2x from '../assets/cards/use-images-2x.webp'
import pdf1x from '../assets/cards/use-pdf-1x.webp'
import pdf2x from '../assets/cards/use-pdf-2x.webp'
import video1x from '../assets/cards/use-video-1x.webp'
import video2x from '../assets/cards/use-video-2x.webp'

/**
 * The illustrations of the three category cards (Images, PDFs, Video and audio) on Home and Ask,
 * and the Images one in the guide article's aside. The approved art (docs/design-ref/v2/assets/
 * use-*.png) is only 354-366 px wide and no larger original exists, so each comes twice: the
 * original pixels (near-lossless, not the old q80 copy) and a Lanczos 2x enlargement with a light
 * unsharp mask for Retina screens. `srcset` lets a 1x screen take the first and a 2x screen the
 * second; both carry their size, so the box is reserved and nothing shifts.
 */
const sets = {
  images: { x1: images1x, x2: images2x },
  pdf: { x1: pdf1x, x2: pdf2x },
  video: { x1: video1x, x2: video2x },
}

export type CardImage = keyof typeof sets

/** What a card is wide, per viewport: three columns, two from 1100 px, one from 640 px. */
export const CARD_IMAGE_SIZES =
  '(min-width: 1101px) 296px, (min-width: 641px) calc((100vw - 114px) / 2), calc(100vw - 76px)'

export function cardImage(name: CardImage, sizes: string = CARD_IMAGE_SIZES) {
  const { x1, x2 } = sets[name]
  return {
    src: x1.src,
    srcset: `${x1.src} ${x1.width}w, ${x2.src} ${x2.width}w`,
    sizes,
    width: x1.width,
    height: x1.height,
  }
}
