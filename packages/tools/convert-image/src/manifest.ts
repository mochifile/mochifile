import type { EncodableFormat } from '@mochifile/engine-image'
import { defineToolManifest } from '@mochifile/tool-kit'

/** Plain data: posted to the worker with every run. */
export interface ConvertImageOptions extends Record<string, unknown> {
  /** The format of the result. Quality is fixed by the engine (ADR 0016). */
  format: EncodableFormat
}

/** Extensions offered to the file picker next to the MIME types (see `Ui.tsx`). */
export const PICKER_EXTENSIONS = ['.heic', '.heif', '.avif', '.jpg', '.jpeg', '.png', '.webp']

const variant = (
  key: string,
  format: EncodableFormat,
  slug: { en: string; pt: string },
  title: { en: string; pt: string },
  description: { en: string; pt: string },
  tagline: { en: string; pt: string },
) => ({
  key,
  options: { format },
  meta: {
    en: { slug: slug.en, title: title.en, description: description.en, tagline: tagline.en },
    pt: { slug: slug.pt, title: title.pt, description: description.pt, tagline: tagline.pt },
  },
})

/**
 * Pages, routes, the sitemap and SEO tags are generated from this file. Keep it data: the
 * engine is only imported by the worker.
 */
export const manifest = defineToolManifest<ConvertImageOptions>({
  id: 'convert-image',
  category: 'image',
  runtime: 'browser',
  // HEIC photos often arrive without a type; `validateFiles` then goes by the extension.
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'],
  limits: {
    maxFiles: 20,
    maxFileSizeBytes: 50_000_000,
  },
  defaults: { format: 'jpeg' },
  meta: {
    en: {
      slug: 'convert-image',
      title: 'Convert images to JPG, PNG or WebP',
      description:
        'Turn HEIC, WebP, PNG, AVIF or JPG photos into JPG, PNG or WebP in one click. Free, private, nothing is uploaded.',
      tagline: 'Photos that open everywhere.',
    },
    pt: {
      slug: 'converter-imagem',
      title: 'Converter imagem para JPG, PNG ou WebP',
      description:
        'Transforme fotos HEIC, WebP, PNG, AVIF ou JPG em JPG, PNG ou WebP com um clique. Grátis, privado e sem upload.',
      tagline: 'Fotos que abrem em qualquer lugar.',
    },
  },
  relatedPagesLabel: { en: 'Other conversions', pt: 'Outras conversões' },
  variants: [
    variant(
      'heic-to-jpg',
      'jpeg',
      { en: 'heic-to-jpg', pt: 'heic-para-jpg' },
      { en: 'Convert HEIC to JPG', pt: 'Converter HEIC para JPG' },
      {
        en: 'Turn iPhone HEIC photos into JPG that opens on any phone, computer or website. Free, private, nothing is uploaded.',
        pt: 'Transforme fotos HEIC do iPhone em JPG, que abre em qualquer celular, computador ou site. Grátis, privado e sem upload.',
      },
      {
        en: 'iPhone photos that open on any device.',
        pt: 'Fotos do iPhone que abrem em qualquer lugar.',
      },
    ),
    variant(
      'webp-to-jpg',
      'jpeg',
      { en: 'webp-to-jpg', pt: 'webp-para-jpg' },
      { en: 'Convert WebP to JPG', pt: 'Converter WebP para JPG' },
      {
        en: 'Save a WebP image as JPG so forms, apps and old programs accept it. Free, private, nothing is uploaded.',
        pt: 'Salve uma imagem WebP como JPG para que formulários, apps e programas antigos a aceitem. Grátis, privado e sem upload.',
      },
      { en: 'For sites that refuse WebP images.', pt: 'Para sites que recusam imagens WebP.' },
    ),
    variant(
      'png-to-jpg',
      'jpeg',
      { en: 'png-to-jpg', pt: 'png-para-jpg' },
      { en: 'Convert PNG to JPG', pt: 'Converter PNG para JPG' },
      {
        en: 'Turn PNG images and screenshots into smaller JPG files. Transparent areas become white. Free, private, nothing is uploaded.',
        pt: 'Transforme imagens PNG e capturas de tela em arquivos JPG menores. Áreas transparentes ficam brancas. Grátis, privado e sem upload.',
      },
      {
        en: 'Smaller files from screenshots and PNGs.',
        pt: 'Arquivos menores a partir de PNGs e prints.',
      },
    ),
    variant(
      'jpg-to-png',
      'png',
      { en: 'jpg-to-png', pt: 'jpg-para-png' },
      { en: 'Convert JPG to PNG', pt: 'Converter JPG para PNG' },
      {
        en: 'Save a JPG photo as PNG, a format with no further quality loss when you edit and save again. Free, private, nothing is uploaded.',
        pt: 'Salve uma foto JPG como PNG, formato que não perde mais qualidade ao editar e salvar de novo. Grátis, privado e sem upload.',
      },
      {
        en: 'For editing and saving without more loss.',
        pt: 'Para editar e salvar sem perder mais qualidade.',
      },
    ),
    variant(
      'webp-to-png',
      'png',
      { en: 'webp-to-png', pt: 'webp-para-png' },
      { en: 'Convert WebP to PNG', pt: 'Converter WebP para PNG' },
      {
        en: 'Turn a WebP image into PNG and keep its transparent areas. Free, private, nothing is uploaded.',
        pt: 'Transforme uma imagem WebP em PNG mantendo as áreas transparentes. Grátis, privado e sem upload.',
      },
      {
        en: 'Keeps transparency, opens everywhere.',
        pt: 'Mantém a transparência e abre em qualquer lugar.',
      },
    ),
    variant(
      'jpg-to-webp',
      'webp',
      { en: 'jpg-to-webp', pt: 'jpg-para-webp' },
      { en: 'Convert JPG to WebP', pt: 'Converter JPG para WebP' },
      {
        en: 'Save JPG photos as WebP for lighter websites and faster pages. Free, private, nothing is uploaded.',
        pt: 'Salve fotos JPG como WebP para sites mais leves e páginas mais rápidas. Grátis, privado e sem upload.',
      },
      { en: 'Lighter photos for websites.', pt: 'Fotos mais leves para sites.' },
    ),
  ],
})
