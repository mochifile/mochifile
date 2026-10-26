import { afterEach, describe, expect, it } from 'vitest'
import { createToolClient } from './client.ts'
import type { PrepareFn, ProcessFn, ToolProgress } from './contract.ts'
import { defineTool } from './define-tool.ts'
import { ToolError, throwIfAborted } from './errors.ts'
import { validManifest } from './test-fixtures.ts'
import { exposeTool } from './worker.ts'

type Options = { quality: number }

/** Connects a client to a tool through a real MessageChannel, like a Web Worker would. */
function connect(process: ProcessFn<Options>, hooks: { prepare?: PrepareFn } = {}) {
  const tool = defineTool(validManifest, process, hooks)
  // Each worker gets its own channel, as each `new Worker()` would.
  const client = createToolClient(validManifest, () => {
    const channel = new MessageChannel()
    exposeTool(tool, channel.port1)
    return Object.assign(channel.port2, { terminate: () => channel.port1.close() })
  })
  cleanups.push(() => client.dispose())
  return client
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

const png = () => new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })

describe('tool worker round trip', () => {
  it('merges defaults, reports progress and returns results', async () => {
    const client = connect(async (files, options, { onProgress }) => {
      onProgress({ ratio: 0.5, stage: 'working' })
      onProgress({ ratio: 2 })
      return files.map((file) => ({
        file,
        name: file.name,
        meta: { quality: options.quality, size: file.size },
      }))
    })

    const progress: ToolProgress[] = []
    const results = await client.run([png()], {}, { onProgress: (p) => progress.push(p) })

    expect(results).toHaveLength(1)
    expect(results[0]?.name).toBe('a.png')
    expect(results[0]?.meta).toEqual({ quality: 80, size: 3 })
    expect(await results[0]?.file.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer)
    // Delivered before the result resolves, not merely eventually.
    expect(progress).toEqual([{ ratio: 0.5, stage: 'working' }, { ratio: 1 }])
  })

  it('never reports progress after the run has settled', async () => {
    let lateProgress: ((p: ToolProgress) => void) | undefined
    const client = connect(async (files, _options, { onProgress }) => {
      lateProgress = onProgress
      return [{ file: files[0] as File, name: 'x' }]
    })
    const progress: ToolProgress[] = []
    await client.run([png()], {}, { onProgress: (p) => progress.push(p) })
    lateProgress?.({ ratio: 1 })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(progress).toEqual([])
  })

  it('passes user options over defaults', async () => {
    const client = connect(async (files, options) => [
      { file: files[0] as File, name: 'x', meta: { quality: options.quality } },
    ])
    const [result] = await client.run([png()], { quality: 10 })
    expect(result?.meta).toEqual({ quality: 10 })
  })

  it('rethrows ToolError codes from the worker', async () => {
    const client = connect(async () => {
      throw new ToolError('processing-failed', 'decoder crashed')
    })
    await expect(client.run([png()])).rejects.toMatchObject({
      name: 'ToolError',
      code: 'processing-failed',
    })
  })

  it('validates files before posting them', async () => {
    const client = connect(async () => [])
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    await expect(client.run([pdf])).rejects.toMatchObject({ code: 'unsupported-type' })
  })

  it('aborts a running job', async () => {
    const client = connect(async (_files, _options, { signal }) => {
      for (;;) {
        throwIfAborted(signal)
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    })
    const controller = new AbortController()
    const run = client.run([png()], {}, { signal: controller.signal })
    setTimeout(() => controller.abort(), 20)
    await expect(run).rejects.toMatchObject({ code: 'aborted' })
  })
})

describe('prepare', () => {
  const noop: ProcessFn<Options> = async (files) => [{ file: files[0] as File, name: 'x' }]

  it('resolves for tools without a prepare hook', async () => {
    await expect(connect(noop).prepare()).resolves.toBeUndefined()
  })

  it('runs the hook once however often it is called', async () => {
    let calls = 0
    const client = connect(noop, {
      prepare: async () => {
        calls += 1
      },
    })
    await Promise.all([client.prepare(), client.prepare()])
    await client.prepare()
    expect(calls).toBe(1)
  })

  it('reports a failed preparation and lets it be retried', async () => {
    let attempts = 0
    const client = connect(noop, {
      prepare: async () => {
        attempts += 1
        if (attempts === 1) throw new ToolError('processing-failed', 'codec missing')
      },
    })
    await expect(client.prepare()).rejects.toMatchObject({ code: 'processing-failed' })
    await expect(client.prepare()).resolves.toBeUndefined()
    expect(attempts).toBe(2)
  })

  it('makes a run wait for a preparation in flight', async () => {
    const order: string[] = []
    let finish = () => {}
    const client = connect(
      async (files) => {
        order.push('process')
        return [{ file: files[0] as File, name: 'x' }]
      },
      {
        prepare: () =>
          new Promise<void>((resolve) => {
            finish = () => {
              order.push('prepared')
              resolve()
            }
          }),
      },
    )
    const prepared = client.prepare()
    const run = client.run([png()])
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(order).toEqual([])
    finish()
    await Promise.all([prepared, run])
    expect(order).toEqual(['prepared', 'process'])
  })
})

describe('a worker that fails', () => {
  /** A worker that never answers, like one whose script could not be fetched. */
  function silentWorkers() {
    const workers: MessagePort[] = []
    const client = createToolClient(validManifest, () => {
      const channel = new MessageChannel()
      workers.push(channel.port2)
      return Object.assign(channel.port2, { terminate: () => channel.port2.close() })
    })
    cleanups.push(() => client.dispose())
    return {
      client,
      workers,
      fail: (index: number) => workers[index]?.dispatchEvent(new Event('error')),
    }
  }

  it('rejects the preparation and the runs waiting on it, then starts a fresh worker', async () => {
    const { client, workers, fail } = silentWorkers()
    const prepared = client.prepare()
    const run = client.run([png()])
    fail(0)
    await expect(prepared).rejects.toMatchObject({ code: 'processing-failed' })
    await expect(run).rejects.toMatchObject({ code: 'processing-failed' })

    // Trying again creates a new worker instead of reusing the failed one.
    const retried = client.prepare()
    expect(workers).toHaveLength(2)
    fail(1)
    await expect(retried).rejects.toMatchObject({ code: 'processing-failed' })
  })

  it('starts a fresh worker after a failed preparation and rejects runs left on the old one', async () => {
    let attempts = 0
    let workers = 0
    const tool = defineTool(validManifest, () => new Promise<never>(() => {}), {
      prepare: async () => {
        attempts += 1
        if (attempts === 1) throw new ToolError('processing-failed', 'codec missing')
      },
    })
    const client = createToolClient(validManifest, () => {
      workers += 1
      const channel = new MessageChannel()
      exposeTool(tool, channel.port1)
      return Object.assign(channel.port2, { terminate: () => channel.port1.close() })
    })
    cleanups.push(() => client.dispose())
    const prepared = client.prepare()
    const run = client.run([png()])
    await expect(prepared).rejects.toMatchObject({ code: 'processing-failed' })
    await expect(run).rejects.toMatchObject({ code: 'processing-failed' })
    await expect(client.prepare()).resolves.toBeUndefined()
    expect(workers).toBe(2)
  })

  it('rejects calls still running when disposed', async () => {
    const client = connect(() => new Promise<never>(() => {}))
    const run = client.run([png()])
    client.dispose()
    await expect(run).rejects.toMatchObject({ code: 'aborted' })
  })
})
