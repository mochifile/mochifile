import type { OutputFormat } from '@mochifile/engine-image'
import { defineToolManifest } from '@mochifile/tool-kit'

/** Plain data: posted to the worker with every run. */
export interface CompressImageOptions extends Record<string, unknown> {
  /** Maximum size of each result, in bytes (1 KB = 1,000 bytes). */
  targetBytes: number
  /** `original` keeps the input format when it can reach the target. */
  format: OutputFormat
}

const variant = (
  key: string,
  targetBytes: number,
  label: { en: string; pt: string },
  description: { en: string; pt: string },
  tagline: { en: string; pt: string },
) => ({
  key,
  options: { targetBytes },
  meta: {
    en: {
      slug: `compress-image-to-${key}`,
      title: `Compress an image to ${label.en}`,
      description: description.en,
      tagline: tagline.en,
    },
    pt: {
      slug: `comprimir-imagem-para-${key}`,
      title: `Comprimir imagem para ${label.pt}`,
      description: description.pt,
      tagline: tagline.pt,
    },
  },
})

/**
 * Pages, routes, the sitemap and SEO tags are generated from this file. Keep it data: the
 * engine is only imported by the worker.
 */
export const manifest = defineToolManifest<CompressImageOptions>({
  id: 'compress-image',
  category: 'image',
  runtime: 'browser',
  accepts: ['image/jpeg', 'image/png', 'image/webp'],
  limits: {
    maxFiles: 20,
    maxFileSizeBytes: 50_000_000,
  },
  defaults: { targetBytes: 100_000, format: 'original' },
  meta: {
    en: {
      slug: 'compress-image',
      title: 'Compress an image to a target size',
      description:
        'Shrink a JPG, PNG or WebP photo to the size limit you need, like 50 KB or 100 KB, for forms and uploads. Free, private, nothing uploaded.',
      tagline: 'For forms and sites that refuse big photos.',
    },
    pt: {
      slug: 'comprimir-imagem',
      title: 'Comprimir imagem para o tamanho que você precisa',
      description:
        'Reduza uma foto JPG, PNG ou WebP para o limite de que você precisa, como 50 KB ou 100 KB, em formulários e envios. Grátis, privado e sem upload.',
      tagline: 'Para formulários e portais que recusam fotos grandes.',
    },
  },
  relatedPagesLabel: { en: 'Other target sizes', pt: 'Outros tamanhos' },
  variants: [
    variant(
      '20kb',
      20_000,
      { en: '20 KB', pt: '20 KB' },
      {
        en: 'Make a photo 20 KB or smaller for strict upload limits, such as signature or small ID photo fields. Free, private and done in your browser.',
        pt: 'Deixe uma foto com 20 KB ou menos para limites rígidos, como campos de assinatura ou foto 3x4. Grátis, privado e feito no seu navegador.',
      },
      {
        en: 'For signature and small ID photo fields.',
        pt: 'Para campos de assinatura e foto 3x4.',
      },
    ),
    variant(
      '50kb',
      50_000,
      { en: '50 KB', pt: '50 KB' },
      {
        en: 'Get a photo under 50 KB, a common limit on government, exam and job application forms. Free, private and done in your browser.',
        pt: 'Deixe uma foto com menos de 50 KB, um limite comum em formulários de governo, concursos e vagas de emprego. Grátis, privado e no navegador.',
      },
      {
        en: 'For government forms and exam registrations.',
        pt: 'Para formulários de governo e inscrições em concursos.',
      },
    ),
    variant(
      '100kb',
      100_000,
      { en: '100 KB', pt: '100 KB' },
      {
        en: 'Reduce a photo to 100 KB or less for online applications, registrations and profile uploads. Free, private and done in your browser.',
        pt: 'Reduza uma foto para 100 KB ou menos para inscrições online, cadastros e fotos de perfil. Grátis, privado e feito no seu navegador.',
      },
      {
        en: 'For applications, sign-ups and profile photos.',
        pt: 'Para inscrições, cadastros e fotos de perfil.',
      },
    ),
    variant(
      '200kb',
      200_000,
      { en: '200 KB', pt: '200 KB' },
      {
        en: 'Compress a photo to 200 KB or less for document uploads and websites, with good quality kept. Free, private and done in your browser.',
        pt: 'Comprima uma foto para 200 KB ou menos para envio de documentos e sites, mantendo boa qualidade. Grátis, privado e feito no seu navegador.',
      },
      {
        en: 'For sending documents in good quality.',
        pt: 'Para enviar documentos com boa qualidade.',
      },
    ),
    variant(
      '500kb',
      500_000,
      { en: '500 KB', pt: '500 KB' },
      {
        en: 'Make a photo 500 KB or smaller for email, listings and portals while it stays sharp. Free, private and done in your browser.',
        pt: 'Deixe uma foto com 500 KB ou menos para e-mail, anúncios e portais, ainda nítida. Grátis, privado e feito no seu navegador.',
      },
      {
        en: 'For email and sale listings, with the photo still sharp.',
        pt: 'Para e-mail e anúncios de venda, com a foto nítida.',
      },
    ),
    variant(
      '1mb',
      1_000_000,
      { en: '1 MB', pt: '1 MB' },
      {
        en: 'Get a photo under 1 MB for portals and email attachments with almost no visible loss. Free, private and done in your browser.',
        pt: 'Deixe uma foto com menos de 1 MB para portais e anexos de e-mail, quase sem perda visível. Grátis, privado e feito no seu navegador.',
      },
      {
        en: 'For portals and email, with almost no visible loss.',
        pt: 'Para portais e e-mail, quase sem perda visível.',
      },
    ),
  ],
})
