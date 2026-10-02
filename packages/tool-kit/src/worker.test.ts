import { afterEach, describe, expect, it } from 'vitest'
import { createToolClient } from './client.ts'
import type { ProcessFn, ToolProgress } from './contract.ts'
import { defineTool } from './define-tool.ts'
import { ToolError, throwIfAborted } from './errors.ts'
import { validManifest } from './test-fixtures.ts'
import { exposeTool } from './worker.ts'

type Options = { quality: number }

/** Connects a client to a tool through a real MessageChannel, like a Web Worker would. */
function connect(process: ProcessFn<Options>) {
  const channel = new MessageChannel()
  exposeTool(defineTool(validManifest, process), channel.port1)
  const client = createToolClient(validManifest, () =>
    Object.assign(channel.port2, { terminate: () => channel.port1.close() }),
  )
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
    await expect.poll(() => progress).toEqual([{ ratio: 0.5, stage: 'working' }, { ratio: 1 }])
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
