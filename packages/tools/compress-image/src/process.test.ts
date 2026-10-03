import { createNodeEngine, readPhoto, syntheticImage } from '@mochifile/engine-image/testing'
import { ToolError } from '@mochifile/tool-kit'
import { describe, expect, it, vi } from 'vitest'
import { manifest } from './manifest.ts'
import { createProcess, outputName } from './process.ts'

const engine = createNodeEngine()
const processFiles = createProcess(() => engine)
const context = (signal = new AbortController().signal) => ({ signal, onProgress: vi.fn() })
const file = (bytes: Uint8Array, name: string, type: string) =>
  new File([bytes as Uint8Array<ArrayBuffer>], name, { type })

describe('compress-image process', () => {
  it('compresses to at most the target and names the result', async () => {
    const ctx = context()
    const [result] = await processFiles(
      [file(await readPhoto('landscape'), 'Holiday.JPG', 'image/jpeg')],
      { ...manifest.defaults, targetBytes: 50_000 },
      ctx,
    )
    expect(result?.file.size).toBeLessThanOrEqual(50_000)
    expect(result?.file.type).toBe('image/jpeg')
    expect(result?.name).toBe('Holiday-50kb.JPG')
    expect(result?.meta).toMatchObject({
      outcome: 'compressed',
      format: 'jpeg',
      metadataRemoved: true,
    })
    expect(ctx.onProgress).toHaveBeenLastCalledWith({ ratio: 1 })
  }, 60_000)

  it('changes the extension with the format', async () => {
    const png = await (await engine).codecs.encodePng(syntheticImage(300, 200, { alpha: true }))
    const [result] = await processFiles(
      [file(png, 'logo.png', 'image/png')],
      { targetBytes: 10_000, format: 'webp' },
      context(),
    )
    expect(result?.name).toBe('logo-10kb.webp')
    expect(result?.file.type).toBe('image/webp')
  }, 60_000)

  it('processes several files in order with combined progress', async () => {
    const ctx = context()
    const photo = await readPhoto('flowers')
    const results = await processFiles(
      [file(photo, 'a.jpg', 'image/jpeg'), file(photo, 'b.jpg', 'image/jpeg')],
      { targetBytes: 100_000, format: 'original' },
      ctx,
    )
    expect(results.map((r) => r.name)).toEqual(['a-100kb.jpg', 'b-100kb.jpg'])
    const ratios = ctx.onProgress.mock.calls.map(([p]) => (p as { ratio: number }).ratio)
    expect(ratios).toEqual([...ratios].sort((x, y) => x - y))
  }, 60_000)

  it('rejects targets outside the allowed range', async () => {
    await expect(
      processFiles(
        [file(new Uint8Array([1]), 'a.jpg', 'image/jpeg')],
        { targetBytes: 10, format: 'original' },
        context(),
      ),
    ).rejects.toBeInstanceOf(ToolError)
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      processFiles(
        [file(await readPhoto('flowers'), 'a.jpg', 'image/jpeg')],
        manifest.defaults,
        context(controller.signal),
      ),
    ).rejects.toMatchObject({ code: 'aborted' })
  })
})

describe('outputName', () => {
  it('keeps the original extension when the format does not change', () => {
    expect(outputName('IMG_1.jpeg', 50_000, 'jpeg', 'jpeg')).toBe('IMG_1-50kb.jpeg')
    expect(outputName('scan', 50_000, 'png', 'png')).toBe('scan-50kb.png')
    expect(outputName('scan.png', 1_000_000, 'png', 'jpeg')).toBe('scan-1mb.jpg')
  })
})
