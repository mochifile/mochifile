/** Images imported by the panel. */
declare module '*.webp' {
  /** Astro's image metadata: the built URL and the file's pixel size. */
  const image: { src: string; width: number; height: number }
  export default image
}

/** The panel's stylesheet: Vite bundles it with the island. */
declare module '*.css'
