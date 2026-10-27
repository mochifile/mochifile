import { Button, buttonClasses, cn, Mascot, Notice, ProgressBar } from '@mochifile/ui'
import type { ReactNode } from 'react'
import { DownloadIcon } from './DownloadIcon.tsx'
import { FileName } from './FileName.tsx'
import type { QueueItem } from './use-file-queue.ts'

/** Text supplied by each tool through its locale's Paraglide messages. */
export interface ResultRowLabels {
  waiting: string
  cancelled: string
  download: string
  downloadNamed: (name: string) => string
  progressLabel: (name: string) => string
  /** Visible text of the remove button, e.g. "Remove"; needed with `onRemove`. */
  remove?: string
  /** Its accessible name, which must start with the visible text: "Remove IMG_0412.jpg". */
  removeNamed?: (name: string) => string
}

export interface ResultRowProps<Settings, Meta> {
  item: QueueItem<Settings, Meta>
  index: number
  labels: ResultRowLabels
  formatBytes: (bytes: number) => string
  sizeSummary: (before: number, after: number) => string
  stageMessage: (stage: string | undefined) => string
  errorMessage: (item: QueueItem<Settings, Meta>) => string
  resultDetails?: ReactNode
  resultActions?: ReactNode
  /** Takes the file out of the list; shows a remove button in every state. */
  onRemove?: () => void
  /** The file's icon tile (`FileTile`), shown at the start of the row. */
  icon?: ReactNode
  /**
   * Whether the mascot squishes beside a file being processed. Off when a `BatchStatus` above
   * the list already shows it: at most one mascot per region (README › Mascot).
   */
  mascot?: boolean
}

const RESULT_SQUISH = ['rounded-lg-squish-a', 'rounded-lg-squish-b', 'rounded-lg-squish-c'] as const

/**
 * The shared file row of batch tools: icon, name (one line, the extension always visible),
 * size, status or progress, then the result, its details and actions. A file that failed gets
 * a danger outline as well as its message; one that cannot reach the target (an attention,
 * not an error) gets an attention message only.
 */
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
  onRemove,
  icon,
  mascot = true,
}: ResultRowProps<Settings, Meta>) {
  const done = item.status === 'done' && item.result !== undefined
  const unreachable = item.error?.code === 'target-unreachable'
  const failed = item.status === 'error' && !unreachable
  const statusText =
    item.status === 'queued'
      ? labels.waiting
      : item.status === 'working'
        ? stageMessage(item.stage)
        : item.status === 'cancelled'
          ? labels.cancelled
          : undefined
  const removeButton = onRemove && labels.remove && (
    <Button
      variant="secondary"
      className="ms-auto"
      aria-label={labels.removeNamed?.(item.file.name) ?? labels.remove}
      data-remove={item.id}
      onClick={onRemove}
    >
      {labels.remove}
    </Button>
  )
  return (
    <li
      className={cn(
        'flex gap-3 bg-surface-page p-4 sm:gap-4 sm:p-5',
        RESULT_SQUISH[index % RESULT_SQUISH.length],
        failed && 'border-chip border-danger',
        done && 'motion-safe:animate-ready',
      )}
      data-status={item.status}
    >
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <FileName name={item.file.name} className="type-body-strong sm:flex-1" />
          <span
            className={cn(
              'shrink-0',
              item.result ? 'type-title-sm text-ink' : 'type-body-sm text-ink-muted',
            )}
          >
            {item.result
              ? sizeSummary(item.file.size, item.result.blob.size)
              : formatBytes(item.file.size)}
          </span>
        </div>
        <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
          {statusText !== undefined && item.status !== 'working' && (
            <span className="type-body-sm text-ink-muted">{statusText}</span>
          )}
          {item.status === 'working' && (
            <div className="flex items-center gap-3">
              {mascot && <Mascot state="squish" className="w-14" />}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="type-body-sm">{statusText}</span>
                <ProgressBar value={item.progress} label={labels.progressLabel(item.file.name)} />
              </div>
            </div>
          )}
          {item.status === 'error' && (
            <div role="alert">
              <Notice tone={unreachable ? 'warning' : 'danger'}>{errorMessage(item)}</Notice>
            </div>
          )}
          {done && resultDetails}
        </div>
        {(done || removeButton) && (
          <div className="flex flex-wrap items-center gap-3">
            {done && item.result && (
              <a
                href={item.result.url}
                download={item.result.name}
                aria-label={labels.downloadNamed(item.result.name)}
                className={buttonClasses('primary', 'w-full sm:w-auto')}
              >
                <DownloadIcon />
                {labels.download}
              </a>
            )}
            {done && resultActions}
            {removeButton}
          </div>
        )}
      </div>
    </li>
  )
}
