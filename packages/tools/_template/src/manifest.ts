import { defineToolManifest } from '@mochifile/tool-kit'
import { config, type TemplateOptions } from './config.ts'

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
  // What the UI needs at run time is in `config.ts`.
  ...config,
  meta: {
    en: {
      slug: 'template-tool',
      title: 'Template tool',
      description:
        'Example tool that changes the case of a text file. Copy it to build a new tool.',
      // One line under the H1, at most 60 characters. TODO(new tool): replace.
      tagline: 'Changes the letters of a text file.',
    },
    pt: {
      slug: 'ferramenta-modelo',
      title: 'Ferramenta modelo',
      description:
        'Ferramenta de exemplo que muda as letras de um arquivo de texto. Copie-a para criar outra.',
      tagline: 'Muda as letras de um arquivo de texto.',
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
          tagline: 'Starts in lower case.',
        },
        pt: {
          slug: 'ferramenta-modelo-minusculas',
          title: 'Ferramenta modelo: minúsculas',
          description: 'Página de variante de exemplo que já começa no modo minúsculas.',
          tagline: 'Já começa em minúsculas.',
        },
      },
    },
  ],
})
