import type { ToolManifest } from './contract.ts'

export const validManifest: ToolManifest<{ quality: number }> = {
  id: 'example-tool',
  category: 'image',
  runtime: 'browser',
  accepts: ['image/png', 'image/*'],
  limits: { maxFiles: 2, maxFileSizeBytes: 100, maxTotalSizeBytes: 150 },
  defaults: { quality: 80 },
  meta: {
    en: {
      slug: 'example-tool',
      title: 'Example tool',
      description: 'An example tool.',
      tagline: 'For examples.',
    },
    pt: {
      slug: 'ferramenta-exemplo',
      title: 'Ferramenta exemplo',
      description: 'Um exemplo.',
      tagline: 'Para exemplos.',
    },
  },
}
