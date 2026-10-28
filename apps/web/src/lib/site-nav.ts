import { type Locale, localePath } from '@mochifile/i18n'
import { m } from '@mochifile/i18n/messages'
import { authPaths } from './auth.ts'
import { guidesIndexPaths } from './guides.ts'
import { pagePaths } from './pages.ts'
import { pricingPaths } from './pricing.ts'
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

/**
 * The built pages the shell links to, in every language. A destination missing here has no page
 * yet and stays a "Coming soon" control (terms, privacy, the Chrome extension, the CLI).
 */
const route = (en: string, pt: string = en): Record<Locale, string> => ({
  en: localePath('en', en),
  pt: localePath('pt', pt),
})
export const shellPaths = {
  solutions: route('solutions', 'solucoes'),
  guides: guidesIndexPaths(),
  docs: route('docs'),
  pricing: pricingPaths,
  signIn: authPaths('sign-in'),
  signUp: authPaths('sign-up'),
  about: pagePaths('about'),
  contact: pagePaths('contact'),
  sustainability: pagePaths('sustainability'),
  architecture: pagePaths('architecture'),
} as const

/** A link with its destination in this language. */
const link = (
  key: string,
  label: string,
  paths: Record<Locale, string> | undefined,
  locale: Locale,
): ShellLink => (paths ? { key, label, href: paths[locale] } : { key, label })

/**
 * Whether `href` is the page being shown or a section it belongs to (a guide is in Guides), for
 * `aria-current`. The home page is current only for itself.
 */
export function isCurrent(href: string | undefined, here: string): boolean {
  if (!href) return false
  return href === here || (href.split('/').filter(Boolean).length > 0 && here.startsWith(href))
}

export const GITHUB_REPOSITORY = 'https://github.com/mochifile/mochifile'
export const CREDIT_URL = 'https://github.com/RaioViajante'

/** The header's links, in the canvas's order. */
export function mainLinks(locale: Locale): ShellLink[] {
  return [
    link('solutions', m.nav_solutions({}, { locale }), shellPaths.solutions, locale),
    link('guides', m.nav_guides({}, { locale }), shellPaths.guides, locale),
    link('docs', m.nav_docs({}, { locale }), shellPaths.docs, locale),
    link('pricing', m.nav_pricing({}, { locale }), shellPaths.pricing, locale),
  ]
}

export function accountLinks(locale: Locale): { signIn: ShellLink; getStarted: ShellLink } {
  return {
    signIn: link('sign-in', m.nav_sign_in({}, { locale }), shellPaths.signIn, locale),
    getStarted: link('get-started', m.nav_get_started({}, { locale }), shellPaths.signUp, locale),
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
        link('api-docs', m.footer_api_docs({}, { locale }), shellPaths.docs, locale),
      ],
    },
  ]
}

/** Company and legal links, in the canvas's order. */
export function companyLinks(locale: Locale): ShellLink[] {
  return [
    link('about', m.footer_about({}, { locale }), shellPaths.about, locale),
    link('contact', m.footer_contact({}, { locale }), shellPaths.contact, locale),
    link(
      'sustainability',
      m.footer_sustainability({}, { locale }),
      shellPaths.sustainability,
      locale,
    ),
    link('architecture', m.footer_architecture({}, { locale }), shellPaths.architecture, locale),
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

/** The footer's two pills: all solutions and the guides. */
export function footerPills(locale: Locale): { solutions: ShellLink; guides: ShellLink } {
  return {
    solutions: link(
      'view-solutions',
      m.footer_view_solutions({}, { locale }),
      shellPaths.solutions,
      locale,
    ),
    guides: link('read-guides', m.footer_read_guides({}, { locale }), shellPaths.guides, locale),
  }
}
