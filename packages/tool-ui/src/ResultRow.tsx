import { buttonClasses, cn, Mascot, Notice, ProgressBar } from '@mochifile/ui'
import type { ReactNode } from 'react'
import { DownloadIcon } from './DownloadIcon.tsx'
import type { QueueItem } from './use-file-queue.ts'

/** Text supplied by each tool through its locale's Paraglide messages. */
export interface ResultRowLabels {
  waiting: string
  cancelled: string
  download: string
  downloadNamed: (name: string) => string
  progressLabel: (name: string) => string
}

export interface ResultRowProps<Settings, Meta> {
  item: QueueItem<Settings, Meta>
  index: number
  labels: ResultRowLabels
  formatBytes: (bytes: number) => string
  sizeSummary: (before: number, after: number, item: QueueItem<Settings, Meta>) => string
  stageMessage: (stage: string | undefined) => string
  errorMessage: (item: QueueItem<Settings, Meta>) => string
  resultDetails?: ReactNode
  resultActions?: ReactNode
}

const RESULT_SQUISH = ['rounded-lg-squish-a', 'rounded-lg-squish-b', 'rounded-lg-squish-c'] as const

/** The shared file status, progress, result and download row used by batch tools. */
export function ResultRow<Settings, Meta>({
  item,
  index,
  labels,
  formatBytes,
  sizeSummary,
  stageMessage,
  errorMessage,
  resultDetails,
  resultActions,
}: ResultRowProps<Settings, Meta>) {
  return (
    <li
      className={cn(
        'flex flex-col gap-3 bg-surface-page p-4 sm:p-5',
        RESULT_SQUISH[index % RESULT_SQUISH.length],
        item.status === 'done' && 'motion-safe:animate-ready',
      )}
      data-status={item.status}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 break-all type-body-strong">{item.file.name}</span>
        <span className={item.result ? 'type-title-sm text-ink' : 'type-body-sm text-ink-muted'}>
          {item.result
            ? sizeSummary(item.file.size, item.result.blob.size, item)
            : formatBytes(item.file.size)}
        </span>
      </div>
      <div aria-live="polite" className="flex flex-col gap-3">
        {item.status === 'queued' && (
          <span className="type-body-sm text-ink-muted">{labels.waiting}</span>
        )}
        {item.status === 'working' && (
          <div className="flex items-center gap-3">
            <Mascot state="squish" className="w-14" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="type-body-sm">{stageMessage(item.stage)}</span>
              <ProgressBar value={item.progress} label={labels.progressLabel(item.file.name)} />
            </div>
          </div>
        )}
        {item.status === 'cancelled' && (
          <span className="type-body-sm text-ink-muted">{labels.cancelled}</span>
        )}
        {item.status === 'error' && (
          <div role="alert">
            <Notice tone="danger">{errorMessage(item)}</Notice>
          </div>
        )}
        {item.status === 'done' && item.result && resultDetails}
      </div>
      {item.status === 'done' && item.result && (
        <div className="flex flex-wrap gap-3">
          <a
            href={item.result.url}
            download={item.result.name}
            aria-label={labels.downloadNamed(item.result.name)}
            className={buttonClasses('primary', 'w-full sm:w-auto')}
          >
            <DownloadIcon />
            {labels.download}
          </a>
          {resultActions}
        </div>
      )}
    </li>
  )
}
