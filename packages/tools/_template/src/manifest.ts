import { defineToolManifest } from '@mochifile/tool-kit'

/**
 * Options for this tool. Keep them plain data: they are posted to a Web Worker.
 * TODO(new tool): replace with your tool's options.
 */
export interface TemplateOptions extends Record<string, unknown> {
  mode: 'upper' | 'lower'
}

/**
 * The manifest is plain data. Pages, routes, the sitemap and SEO tags are generated from it,
 * so it must stay small: never import processing code or heavy libraries here.
 */
export const manifest = defineToolManifest<TemplateOptions>({
  // TODO(new tool): a stable, kebab-case id. Never change it after release.
  id: 'template-tool',
  // TODO(new tool): 'image', 'media' or 'pdf'. The template uses 'pdf' (documents).
  category: 'pdf',
  runtime: 'browser',
  accepts: ['text/plain'],
  limits: {
    maxFiles: 1,
    maxFileSizeBytes: 5 * 1000 * 1000,
  },
  defaults: { mode: 'upper' },
  meta: {
    en: {
      slug: 'template-tool',
      title: 'Template tool',
      description:
        'Example tool that changes the case of a text file. Copy it to build a new tool.',
    },
    pt: {
      slug: 'ferramenta-modelo',
      title: 'Ferramenta modelo',
      description:
        'Ferramenta de exemplo que muda as letras de um arquivo de texto. Copie-a para criar outra.',
    },
  },
  // Optional landing pages that start with preset options. Each needs its own copy in
  // content/<locale>/<key>.md. TODO(new tool): replace or remove.
  variants: [
    {
      key: 'lowercase',
      options: { mode: 'lower' },
      meta: {
        en: {
          slug: 'template-tool-lowercase',
          title: 'Template tool: lower case',
          description: 'Example variant page that starts in lower-case mode.',
        },
        pt: {
          slug: 'ferramenta-modelo-minusculas',
          title: 'Ferramenta modelo: minúsculas',
          description: 'Página de variante de exemplo que já começa no modo minúsculas.',
        },
      },
    },
  ],
})
