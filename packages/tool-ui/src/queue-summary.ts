import type { QueueItem } from './use-file-queue.ts'

/** Counts for a batch's summary line ("Ready: 3 of 5 photos"). */
export interface QueueSummary {
  total: number
  /** Processed successfully. */
  done: number
  /** Waiting or being processed. */
  pending: number
  /** Stopped by a cancel before they finished. */
  cancelled: number
  /** Refused or failed: they need the person's attention. */
  failed: number
  /** Size of the files that are done, before and after: the batch's "14 MB → 226 KB". */
  bytesBefore: number
  bytesAfter: number
}

/** Summarizes a tool's list. Pure, so every tool words the same numbers its own way. */
export function summarizeQueue<Settings, Meta>(
  items: ReadonlyArray<QueueItem<Settings, Meta>>,
): QueueSummary {
  const summary: QueueSummary = {
    total: items.length,
    done: 0,
    pending: 0,
    cancelled: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  }
  for (const item of items) {
    if (item.status === 'done') {
      summary.done += 1
      summary.bytesBefore += item.file.size
      summary.bytesAfter += item.result?.blob.size ?? 0
    } else if (item.status === 'queued' || item.status === 'working') summary.pending += 1
    else if (item.status === 'cancelled') summary.cancelled += 1
    else summary.failed += 1
  }
  return summary
}
