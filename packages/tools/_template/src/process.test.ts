import { ToolError } from '@mochifile/tool-kit'
import { describe, expect, it, vi } from 'vitest'
import { manifest } from './manifest.ts'
import { processFiles } from './process.ts'

const context = (signal = new AbortController().signal) => ({ signal, onProgress: vi.fn() })
const textFile = (text: string, name = 'notes.txt') =>
  new File([text], name, { type: 'text/plain' })

describe('template tool', () => {
  it('has a valid manifest', () => {
    // defineToolManifest already validated it; this guards the defaults contributors edit.
    expect(manifest.defaults).toEqual({ mode: 'upper' })
  })

  it('converts text to upper case by default', async () => {
    const ctx = context()
    const [result] = await processFiles([textFile('Olá, Mochifile!')], manifest.defaults, ctx)
    expect(await result?.file.text()).toBe('OLÁ, MOCHIFILE!')
    expect(result?.name).toBe('notes-upper.txt')
    expect(result?.meta).toEqual({ characters: 15 })
    expect(ctx.onProgress).toHaveBeenLastCalledWith({ ratio: 1 })
  })

  it('converts to lower case when asked', async () => {
    const [result] = await processFiles([textFile('ABC')], { mode: 'lower' }, context())
    expect(await result?.file.text()).toBe('abc')
    expect(result?.name).toBe('notes-lower.txt')
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      processFiles([textFile('x')], manifest.defaults, context(controller.signal)),
    ).rejects.toBeInstanceOf(ToolError)
  })
})
