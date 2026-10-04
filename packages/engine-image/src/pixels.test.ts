// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applyOrientation } from './pixels.ts'
import { installImageData } from './testing/index.ts'

installImageData()

/** A 3 × 2 image whose pixels are numbered 1–6 in the red channel, row by row. */
function numbered(): ImageData {
  const data = new Uint8ClampedArray(3 * 2 * 4)
  for (let i = 0; i < 6; i += 1) data.set([i + 1, 0, 0, 255], i * 4)
  return new ImageData(data, 3, 2)
}

/** Red channel, row by row. */
const rows = (image: ImageData) =>
  Array.from({ length: image.height }, (_, y) =>
    Array.from({ length: image.width }, (_, x) => image.data[(y * image.width + x) * 4]),
  )

describe('applyOrientation', () => {
  // Stored:  1 2 3
  //          4 5 6
  it.each([
    [
      1,
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
    ],
    [
      2,
      [
        [3, 2, 1],
        [6, 5, 4],
      ],
    ],
    [
      3,
      [
        [6, 5, 4],
        [3, 2, 1],
      ],
    ],
    [
      4,
      [
        [4, 5, 6],
        [1, 2, 3],
      ],
    ],
    [
      5,
      [
        [1, 4],
        [2, 5],
        [3, 6],
      ],
    ],
    [
      6,
      [
        [4, 1],
        [5, 2],
        [6, 3],
      ],
    ],
    [
      7,
      [
        [6, 3],
        [5, 2],
        [4, 1],
      ],
    ],
    [
      8,
      [
        [3, 6],
        [2, 5],
        [1, 4],
      ],
    ],
  ])('EXIF orientation %i', (orientation, expected) => {
    expect(rows(applyOrientation(numbered(), orientation))).toEqual(expected)
  })
})
