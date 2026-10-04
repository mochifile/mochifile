// subset-font ships no types; this covers the options fonts/subset.ts uses.
declare module 'subset-font' {
  type Axis = number | { min: number; max: number; default?: number }
  export default function subsetFont(
    buffer: Buffer,
    text: string,
    options?: {
      targetFormat?: 'sfnt' | 'woff' | 'woff2' | 'truetype'
      variationAxes?: Record<string, Axis>
    },
  ): Promise<Buffer>
}
