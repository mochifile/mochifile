import { describe, expect, it } from 'vitest'
import { summarizeQueue } from './queue-summary.ts'
import type { QueueItem, QueueStatus } from './use-file-queue.ts'

let id = 0
function item(status: QueueStatus, size: number, resultSize?: number): QueueItem<object, object> {
  id += 1
  return {
    id,
    file: new File([new Uint8Array(size)], `${id}.jpg`),
    status,
    settings: {},
    progress: 0,
    ...(resultSize === undefined
      ? {}
      : {
          result: { blob: new Blob([new Uint8Array(resultSize)]), url: '', name: '', meta: {} },
        }),
  }
}

describe('summarizeQueue', () => {
  it('counts each status and adds up the sizes of finished files only', () => {
    expect(
      summarizeQueue([
        item('done', 1000, 100),
        item('done', 500, 50),
        item('working', 700),
        item('queued', 300),
        item('cancelled', 200),
        item('error', 900),
      ]),
    ).toEqual({
      total: 6,
      done: 2,
      pending: 2,
      cancelled: 1,
      failed: 1,
      bytesBefore: 1500,
      bytesAfter: 150,
    })
  })

  it('is all zeros for an empty list', () => {
    expect(summarizeQueue([])).toMatchObject({ total: 0, done: 0, bytesBefore: 0, bytesAfter: 0 })
  })
})
