import type { Locale } from '@mochifile/i18n'
import type { ToolOptions } from '@mochifile/tool-kit'
import { type ComponentType, lazy, Suspense, useMemo } from 'react'

export interface ToolUiProps {
  locale: Locale
  /** Options a variant page starts with, applied over the manifest defaults. */
  initialOptions?: ToolOptions
}

type UiModule = { default: ComponentType<ToolUiProps> }

/**
 * Every tool's UI component, loaded on demand so each page only ships its own tool.
 * The template is a separate glob behind a statically known flag, so production builds
 * contain none of its code.
 */
const uis: Record<string, () => Promise<UiModule>> = {
  ...import.meta.glob<UiModule>([
    '../../../../packages/tools/*/src/Ui.tsx',
    '!../../../../packages/tools/_template/src/Ui.tsx',
  ]),
  ...(import.meta.env.DEV || import.meta.env.MOCHIFILE_INCLUDE_TEMPLATE
    ? import.meta.glob<UiModule>('../../../../packages/tools/_template/src/Ui.tsx')
    : {}),
}

interface Props extends ToolUiProps {
  /** Folder name of the tool under `packages/tools/`. */
  dir: string
}

/**
 * The single React island used by tool pages (rendered with `client:only`). It lazy-loads the
 * tool's own UI, so each page only downloads the code of its tool.
 */
export default function ToolIsland({ dir, ...uiProps }: Props) {
  const Ui = useMemo(() => {
    const load = uis[`../../../../packages/tools/${dir}/src/Ui.tsx`]
    if (!load) throw new Error(`No UI found for tool "${dir}"`)
    return lazy(load)
  }, [dir])

  return (
    <Suspense fallback={<div className="tool-reserve animate-pulse rounded-lg bg-surface-card" />}>
      <Ui {...uiProps} />
    </Suspense>
  )
}
