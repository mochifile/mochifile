// The bundler (Vite) turns `?url` imports into the emitted asset's URL.
declare module '*.wasm?url' {
  const url: string
  export default url
}
