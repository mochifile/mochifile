import type { Locale } from '@mochifile/i18n'
import { m } from '@mochifile/i18n/messages'
import { type RegisteredTool, toolPages } from './tools.ts'

/**
 * What the header, the phone menu and the footer list (ADR 0030). Everything the V2 canvas
 * draws is here, whether it exists yet or not: a link with no `href` is a destination that is
 * not built, and renders as a "Coming soon" control instead of a link, so no link ever leads
 * nowhere. When a page ships, give its entry an `href`; nothing else changes.
 */
export interface ShellLink {
  /** Stable key, for tests and `data-` hooks. */
  key: string
  label: string
  /** Absent until the destination exists. */
  href?: string
}

export const GITHUB_REPOSITORY = 'https://github.com/mochifile/mochifile'
export const CREDIT_URL = 'https://github.com/RaioViajante'

/** The header's links, in the canvas's order. */
export function mainLinks(locale: Locale): ShellLink[] {
  return [
    { key: 'solutions', label: m.nav_solutions({}, { locale }) },
    { key: 'guides', label: m.nav_guides({}, { locale }) },
    { key: 'docs', label: m.nav_docs({}, { locale }) },
    { key: 'pricing', label: m.nav_pricing({}, { locale }) },
  ]
}

export function accountLinks(locale: Locale): { signIn: ShellLink; getStarted: ShellLink } {
  return {
    signIn: { key: 'sign-in', label: m.nav_sign_in({}, { locale }) },
    getStarted: { key: 'get-started', label: m.nav_get_started({}, { locale }) },
  }
}

/** Path of a tool's page (`index` for its main page, else a variant key), if it is published. */
export function toolHref(
  registered: readonly RegisteredTool[],
  dir: string,
  key: string,
  locale: Locale,
): string | undefined {
  return toolPages(registered).find((page) => page.tool.dir === dir && page.key === key)?.paths[
    locale
  ]
}

export interface FooterColumn {
  key: string
  heading: string
  links: ShellLink[]
}

/**
 * The footer's three columns. A tool's link points at its real page when the registry has it
 * (Compress image and its 50 KB page today) and is "Coming soon" otherwise.
 */
export function footerColumns(
  locale: Locale,
  registered: readonly RegisteredTool[],
): FooterColumn[] {
  const tool = (key: string, label: string, dir: string, page: string): ShellLink => {
    const href = toolHref(registered, dir, page, locale)
    return href ? { key, label, href } : { key, label }
  }
  return [
    {
      key: 'popular',
      heading: m.footer_popular_tools({}, { locale }),
      links: [
        tool('compress-image', m.footer_compress_image({}, { locale }), 'compress-image', 'index'),
        tool('compress-50kb', m.footer_compress_50kb({}, { locale }), 'compress-image', '50kb'),
        { key: 'heic-to-jpg', label: m.footer_heic_to_jpg({}, { locale }) },
        { key: 'webp-to-jpg', label: m.footer_webp_to_jpg({}, { locale }) },
        { key: 'images-to-pdf', label: m.footer_images_to_pdf({}, { locale }) },
      ],
    },
    {
      key: 'video',
      heading: m.footer_video({}, { locale }),
      links: [
        { key: 'mp4-to-webm', label: m.footer_mp4_to_webm({}, { locale }) },
        { key: 'webm-to-mp4', label: m.footer_webm_to_mp4({}, { locale }) },
      ],
    },
    {
      key: 'install',
      heading: m.footer_install({}, { locale }),
      links: [
        { key: 'chrome-extension', label: m.footer_chrome_extension({}, { locale }) },
        { key: 'cli-mcp', label: m.footer_cli_mcp({}, { locale }) },
        { key: 'api-docs', label: m.footer_api_docs({}, { locale }) },
      ],
    },
  ]
}

/** Company and legal links, in the canvas's order. */
export function companyLinks(locale: Locale): ShellLink[] {
  return [
    { key: 'about', label: m.footer_about({}, { locale }) },
    { key: 'contact', label: m.footer_contact({}, { locale }) },
    { key: 'sustainability', label: m.footer_sustainability({}, { locale }) },
    { key: 'architecture', label: m.footer_architecture({}, { locale }) },
    { key: 'terms-of-service', label: m.footer_terms_of_service({}, { locale }) },
    { key: 'privacy-policy', label: m.footer_privacy_policy({}, { locale }) },
    { key: 'terms-conditions', label: m.footer_terms_conditions({}, { locale }) },
    { key: 'dpa', label: m.footer_dpa({}, { locale }) },
  ]
}

/** The "Ask AI about Mochifile" destinations. */
export const askAiTargets = [
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'perplexity', label: 'Perplexity' },
  { key: 'google-ai-mode', label: 'Google AI Mode' },
] as const

export interface ShellLanguage {
  /** The language's own name, never translated. */
  name: string
  /** BCP 47 tag, for `lang` and `hreflang`. */
  tag: string
  /** Set for the languages that have pages; the others are shown and marked "Coming soon". */
  locale?: Locale
}

/** The canvas's six languages, English first, in their own names and without flags. */
export const shellLanguages: readonly ShellLanguage[] = [
  { name: 'English', tag: 'en', locale: 'en' },
  { name: 'Português (Brasil)', tag: 'pt-BR', locale: 'pt' },
  { name: 'Español', tag: 'es' },
  { name: 'Français', tag: 'fr' },
  { name: 'हिन्दी', tag: 'hi' },
  { name: '简体中文', tag: 'zh-CN' },
]
