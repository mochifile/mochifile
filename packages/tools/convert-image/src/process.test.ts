import {
  createNodeEngine,
  readHeic,
  readPhoto,
  syntheticImage,
} from '@mochifile/engine-image/testing'
import { describe, expect, it, vi } from 'vitest'
import { createProcess, outputName } from './process.ts'

const engine = createNodeEngine()
const processFiles = createProcess(() => engine)
const context = (signal = new AbortController().signal) => ({ signal, onProgress: vi.fn() })
const file = (bytes: Uint8Array, name: string, type: string) =>
  new File([bytes as Uint8Array<ArrayBuffer>], name, { type })

describe('convert-image process', () => {
  it('converts a JPG to PNG and renames it', async () => {
    const ctx = context()
    const [result] = await processFiles(
      [file(await readPhoto('portrait'), 'Holiday.JPG', 'image/jpeg')],
      { format: 'png' },
      ctx,
    )
    expect(result?.name).toBe('Holiday.png')
    expect(result?.file.type).toBe('image/png')
    expect(result?.meta).toMatchObject({
      outcome: 'converted',
      format: 'png',
      metadataRemoved: true,
    })
    expect(ctx.onProgress).toHaveBeenLastCalledWith({ ratio: 1 })
  }, 60_000)

  it('converts a HEIC with an empty type to JPG', async () => {
    const [result] = await processFiles(
      [file(await readHeic('synthetic'), 'IMG_0001.HEIC', '')],
      { format: 'jpeg' },
      context(),
    )
    expect(result?.name).toBe('IMG_0001.jpg')
    expect(result?.file.type).toBe('image/jpeg')
    expect(result?.meta).toMatchObject({ originalFormat: 'heic', format: 'jpeg' })
  }, 60_000)

  it('fills transparency on white when saving as JPG, and keeps it as PNG', async () => {
    const png = await (await engine).codecs.encodePng(syntheticImage(200, 100, { alpha: true }))
    const [jpg] = await processFiles(
      [file(png, 'logo.png', 'image/png')],
      { format: 'jpeg' },
      context(),
    )
    expect(jpg?.meta).toMatchObject({ flattenedTransparency: true })
    const webp = await (await engine).codecs.encodeWebp(
      syntheticImage(200, 100, { alpha: true }),
      90,
    )
    const [png2] = await processFiles(
      [file(webp, 'logo.webp', 'image/webp')],
      { format: 'png' },
      context(),
    )
    expect(png2?.meta).toMatchObject({ flattenedTransparency: false, format: 'png' })
  }, 60_000)

  it('passes a file already in the format through and keeps its extension', async () => {
    const [result] = await processFiles(
      [file(await readPhoto('flowers'), 'a.jpeg', 'image/jpeg')],
      { format: 'jpeg' },
      context(),
    )
    expect(result?.name).toBe('a.jpeg')
    expect(result?.meta).toMatchObject({ outcome: 'already-in-format' })
  })

  it('processes several files in order with rising progress', async () => {
    const ctx = context()
    const photo = await readPhoto('flowers')
    const results = await processFiles(
      [file(photo, 'a.jpg', 'image/jpeg'), file(photo, 'b.jpg', 'image/jpeg')],
      { format: 'webp' },
      ctx,
    )
    expect(results.map((r) => r.name)).toEqual(['a.webp', 'b.webp'])
    const ratios = ctx.onProgress.mock.calls.map(([p]) => (p as { ratio: number }).ratio)
    expect(ratios).toEqual([...ratios].sort((x, y) => x - y))
  }, 60_000)

  it('rejects an unknown output format', async () => {
    await expect(
      processFiles(
        [file(new Uint8Array([1]), 'a.jpg', 'image/jpeg')],
        { format: 'gif' as 'png' },
        context(),
      ),
    ).rejects.toMatchObject({ code: 'processing-failed' })
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      processFiles(
        [file(await readPhoto('flowers'), 'a.jpg', 'image/jpeg')],
        { format: 'png' },
        context(controller.signal),
      ),
    ).rejects.toMatchObject({ code: 'aborted' })
  })
})

describe('outputName', () => {
  it('changes the extension with the format and keeps it when nothing changes', () => {
    expect(outputName('IMG_1.HEIC', 'heic', 'jpeg')).toBe('IMG_1.jpg')
    expect(outputName('scan', 'png', 'jpeg')).toBe('scan.jpg')
    expect(outputName('a.jpeg', 'jpeg', 'jpeg')).toBe('a.jpeg')
  })
})
