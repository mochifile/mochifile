/**
 * CRC-32 (the one ZIP uses: IEEE 802.3, reflected, polynomial 0xEDB88320), in "slicing by 8": eight
 * lookup tables let the loop consume eight bytes per step, which matters because the ZIP builder
 * reads every byte of every file once.
 */

// Tables are indexed with values masked to 0–255 and sized 8 × 256, so every read below is in
// range; `as number` only silences `noUncheckedIndexedAccess` without a branch in the hot loop.
const TABLES = (() => {
  const tables = new Int32Array(8 * 256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    tables[n] = c
  }
  for (let n = 0; n < 256; n += 1) {
    let c = tables[n] as number
    for (let slice = 1; slice < 8; slice += 1) {
      c = (tables[c & 255] as number) ^ (c >>> 8)
      tables[slice * 256 + n] = c
    }
  }
  return tables
})()

/**
 * Continues a CRC-32 over `data`: pass the previous result as `crc` (0 to start) and feed the
 * pieces of a file in order.
 */
export function crc32Update(crc: number, data: Uint8Array): number {
  const t = TABLES
  let c = ~crc
  let i = 0
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  for (const end = data.length - 8; i <= end; i += 8) {
    const lo = view.getInt32(i, true) ^ c
    const hi = view.getInt32(i + 4, true)
    c =
      (t[1792 + (lo & 255)] as number) ^
      (t[1536 + ((lo >>> 8) & 255)] as number) ^
      (t[1280 + ((lo >>> 16) & 255)] as number) ^
      (t[1024 + (lo >>> 24)] as number) ^
      (t[768 + (hi & 255)] as number) ^
      (t[512 + ((hi >>> 8) & 255)] as number) ^
      (t[256 + ((hi >>> 16) & 255)] as number) ^
      (t[hi >>> 24] as number)
  }
  for (; i < data.length; i += 1) {
    c = (t[(c ^ (data[i] as number)) & 255] as number) ^ (c >>> 8)
  }
  return ~c >>> 0
}
