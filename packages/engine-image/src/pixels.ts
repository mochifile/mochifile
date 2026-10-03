/** Small pixel operations on non-premultiplied RGBA `ImageData`. */

/** True if any pixel is not fully opaque. */
export function hasTransparency(image: ImageData): boolean {
  const { data } = image
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 255) < 255) return true
  return false
}

/**
 * Composites the image onto white, in place, and makes it fully opaque. Used before encoding
 * to JPEG, which has no transparency: without it, transparent areas would turn black.
 */
export function flattenOnWhite(image: ImageData): void {
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    const alpha = (data[i + 3] ?? 255) / 255
    if (alpha === 1) continue
    const white = 255 * (1 - alpha)
    data[i] = (data[i] ?? 0) * alpha + white
    data[i + 1] = (data[i + 1] ?? 0) * alpha + white
    data[i + 2] = (data[i + 2] ?? 0) * alpha + white
    data[i + 3] = 255
  }
}
