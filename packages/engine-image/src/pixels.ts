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

/**
 * Returns `image` turned to display orientation for an EXIF orientation value (1 = as stored).
 * For decoders that leave transformations to the caller (the AVIF WebAssembly decoder).
 */
export function applyOrientation(image: ImageData, orientation: number): ImageData {
  if (orientation <= 1 || orientation > 8) return image
  const { width: w, height: h, data } = image
  const swap = orientation >= 5
  const W = swap ? h : w
  const out = new ImageData(new Uint8ClampedArray(w * h * 4), W, swap ? w : h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      // Where stored pixel (x, y) lands once displayed.
      let dx = x
      let dy = y
      if (orientation === 2) dx = w - 1 - x
      else if (orientation === 3) [dx, dy] = [w - 1 - x, h - 1 - y]
      else if (orientation === 4) dy = h - 1 - y
      else if (orientation === 5) [dx, dy] = [y, x]
      else if (orientation === 6) [dx, dy] = [h - 1 - y, x]
      else if (orientation === 7) [dx, dy] = [h - 1 - y, w - 1 - x]
      else if (orientation === 8) [dx, dy] = [y, w - 1 - x]
      const from = (y * w + x) * 4
      const to = (dy * W + dx) * 4
      out.data[to] = data[from] ?? 0
      out.data[to + 1] = data[from + 1] ?? 0
      out.data[to + 2] = data[from + 2] ?? 0
      out.data[to + 3] = data[from + 3] ?? 255
    }
  }
  return out
}
