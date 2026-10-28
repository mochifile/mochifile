import { type Locale, localePath } from '@mochifile/i18n'

/**
 * Ask Mochifile (V2 canvas, MFFlow): a concept, not a live assistant. This holds the page's
 * path in each language and the language chips, whose Hindi and Chinese text the canvas draws
 * in their own scripts (kept here, not in the UI messages, which the font subsets must cover).
 */
export const askPaths: Record<Locale, string> = {
  en: localePath('en', 'ask'),
  pt: localePath('pt', 'pergunte'),
}

/** The "example language" chips, in the canvas's order. Only English and Portuguese have a sample. */
export const exampleLanguages = [
  { tag: 'en', label: '“In English”', sample: 'en' },
  { tag: 'pt-BR', label: '“Em português”', sample: 'pt' },
  { tag: 'es', label: '“En español”' },
  { tag: 'fr', label: '“En français”' },
  { tag: 'hi', label: '“हिन्दी में”' },
  { tag: 'zh-CN', label: '“用中文”' },
] as const satisfies ReadonlyArray<{ tag: string; label: string; sample?: Locale }>
