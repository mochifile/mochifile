// @vitest-environment jsdom
import type { ToolResult } from '@mochifile/tool-kit'
import { ZipError, type ZipFailure } from '@mochifile/tool-ui'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * "Download all" when it is slow, when it fails and when it is clicked again and again, with the
 * worker and the ZIP replaced by stubs: what only the panel decides. The ZIP itself is covered in
 * packages/tool-ui, and the real flow, with failures injected, in apps/web/e2e.
 */

const run = vi.fn()
const prepare = vi.fn()
vi.mock('@mochifile/tool-kit/client', () => ({
  createToolClient: () => ({ prepare, run }),
}))
const zip = vi.fn()
vi.mock('@mochifile/tool-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochifile/tool-ui')>()),
  downloadZip: (...args: unknown[]) => zip(...args),
  preloadZip: vi.fn(),
}))

const { default: CompressImageUi } = await import('./Ui.tsx')

const photo = (name: string) => new File([new Uint8Array(6_200_000)], name, { type: 'image/jpeg' })
const meta = {
  outcome: 'compressed',
  format: 'jpeg',
  converted: false,
  resized: false,
  flattenedTransparency: false,
  originalWidth: 4000,
  originalHeight: 3000,
  width: 4000,
  height: 3000,
}

function add(...files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('no file input')
  fireEvent.change(input, { target: { files } })
}

const COPY = {
  en: {
    locale: 'en' as const,
    compress: 'Compress 2 photos',
    all: 'Download all (ZIP)',
    preparing: 'Preparing the ZIP…',
    title: "We couldn't prepare the ZIP.",
    retry: 'Your photos are still here. Try again, or download them one by one.',
    reload:
      "This page can't prepare the ZIP right now. Download the photos one by one, or reload the page and compress them again.",
    tryAgain: 'Try again',
    link: /^Download IMG_/,
    more: 'Compress more',
  },
  pt: {
    locale: 'pt' as const,
    compress: 'Comprimir 2 fotos',
    all: 'Baixar todas (ZIP)',
    preparing: 'Preparando o ZIP…',
    title: 'Não conseguimos preparar o ZIP.',
    retry: 'Suas fotos continuam aqui. Tente de novo ou baixe uma por uma.',
    reload:
      'Esta página não consegue preparar o ZIP agora. Baixe as fotos uma por uma ou recarregue a página e comprima de novo.',
    tryAgain: 'Tentar de novo',
    link: /^Baixar IMG_/,
    more: 'Comprimir mais',
  },
}

/** Two photos compressed, up to the "Download all" button. */
async function ready(locale: 'en' | 'pt' = 'en', names = ['IMG_0412.jpg', 'IMG_0413.jpg']) {
  const copy = COPY[locale]
  render(<CompressImageUi locale={locale} initialOptions={{ targetBytes: 50_000 }} />)
  add(...names.map(photo))
  fireEvent.click(await screen.findByRole('button', { name: copy.compress }))
  return screen.findByRole('button', { name: copy.all })
}

const fail = (reason: ZipFailure) => new ZipError(reason, { cause: new Error('secret-path.wasm') })
/** The region that announces what happened (it is a `status`, so it is read out when it changes). */
const announced = (text: string) => screen.getByText(text).closest('[role="status"]')

beforeEach(() => {
  run.mockReset()
  prepare.mockReset()
  zip.mockReset()
  prepare.mockResolvedValue(undefined)
  run.mockImplementation(async ([file]: File[]) => [
    {
      file: new Blob([new Uint8Array(40_000)]),
      name: (file?.name ?? 'x.jpg').replace('.jpg', '-50kb.jpg'),
      meta,
    } satisfies ToolResult,
  ])
  vi.stubGlobal('Worker', class {})
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:result', revokeObjectURL: () => {} }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Download all', () => {
  it('makes the ZIP of the finished photos, with the translated name, and shows nothing else', async () => {
    zip.mockResolvedValue(undefined)
    fireEvent.click(await ready())
    await waitFor(() => expect(zip).toHaveBeenCalledOnce())
    const [files, zipName] = zip.mock.calls[0] as [Array<{ name: string }>, string]
    expect(files.map((file) => file.name)).toEqual(['IMG_0412-50kb.jpg', 'IMG_0413-50kb.jpg'])
    expect(zipName).toBe('compressed-photos.zip')
    expect(screen.queryByText(COPY.en.title)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: COPY.en.all }).getAttribute('aria-busy')).toBeNull()
  })

  it('says it is preparing, keeps the button focusable and its size, and the photos downloadable', async () => {
    let finish: () => void = () => {}
    zip.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const button = await ready()
    button.focus()
    fireEvent.click(button)

    const busy = await screen.findByRole('button', { name: COPY.en.preparing })
    expect(busy).toBe(button)
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect(busy.getAttribute('aria-disabled')).toBe('true')
    // Not `disabled`: a disabled button loses keyboard focus.
    expect((busy as HTMLButtonElement).disabled).toBe(false)
    expect(document.activeElement).toBe(busy)
    // Both labels are in the button (one cell of a grid), so its width does not change; only the
    // visible one is in the accessible name.
    expect(busy.querySelectorAll('.cp-swap > span')).toHaveLength(2)
    // The photos' own downloads are not held up.
    const links = screen.getAllByRole('link', { name: COPY.en.link })
    expect(links).toHaveLength(2)
    expect(links.every((link) => link.getAttribute('aria-disabled') === null)).toBe(true)

    await act(async () => finish())
    expect(await screen.findByRole('button', { name: COPY.en.all })).toBe(button)
    expect(button.getAttribute('aria-busy')).toBeNull()
    expect(screen.queryByText(COPY.en.title)).toBeNull()
  })

  it('ignores clicks while the ZIP is being made, even ones before React has rendered', async () => {
    let finish: () => void = () => {}
    zip.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const button = await ready()
    // Five clicks in the same task: no render between them.
    act(() => {
      for (let click = 0; click < 5; click += 1) button.click()
    })
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(zip).toHaveBeenCalledOnce()

    await act(async () => finish())
    // Done: it can be used again.
    await screen.findByRole('button', { name: COPY.en.all })
    fireEvent.click(button)
    await waitFor(() => expect(zip).toHaveBeenCalledTimes(2))
  })

  it('does not compress the photos again to make the ZIP', async () => {
    zip.mockRejectedValueOnce(fail('failed')).mockResolvedValue(undefined)
    fireEvent.click(await ready())
    await screen.findByText(COPY.en.title)
    fireEvent.click(screen.getByRole('button', { name: COPY.en.tryAgain }))
    await waitFor(() => expect(zip).toHaveBeenCalledTimes(2))
    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe.each(['en', 'pt'] as const)('when it fails (%s)', (locale) => {
  const copy = COPY[locale]

  it('says so beside the button, announced, with the way on, and keeps the photos', async () => {
    zip.mockRejectedValueOnce(fail('failed'))
    fireEvent.click(await ready(locale))

    expect(await screen.findByText(copy.title)).toBeTruthy()
    expect(screen.getByText(copy.retry)).toBeTruthy()
    // A region that was there before the failure, and says nothing else.
    expect(announced(copy.title)?.getAttribute('role')).toBe('status')
    // The photos are still there, with their own downloads, and the ZIP can be asked for again.
    expect(screen.getAllByRole('link', { name: copy.link })).toHaveLength(2)
    expect(screen.getByRole('button', { name: copy.all })).toBeTruthy()
    expect(within(announced(copy.title) as HTMLElement).getByRole('button')).toBeTruthy()
    // It does not say the file was saved, or that it worked.
    expect(announced(copy.title)?.textContent).not.toMatch(/saved|salv|success|sucesso|worked/i)
    // Nothing from inside leaks.
    expect(document.body.textContent).not.toContain('secret-path')
    expect(document.body.textContent).not.toMatch(/ZipError|zip-archive|chunk|import/i)
  })

  it('tries again from the notice, and the notice goes away when it works', async () => {
    zip.mockRejectedValueOnce(fail('failed')).mockResolvedValueOnce(undefined)
    fireEvent.click(await ready(locale))
    fireEvent.click(await screen.findByRole('button', { name: copy.tryAgain }))
    await waitFor(() => expect(zip).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(copy.title)).toBeNull())
  })

  it('tries again with the main button too', async () => {
    zip.mockRejectedValueOnce(fail('failed')).mockResolvedValueOnce(undefined)
    const button = await ready(locale)
    fireEvent.click(button)
    await screen.findByText(copy.title)
    fireEvent.click(button)
    await waitFor(() => expect(screen.queryByText(copy.title)).toBeNull())
    expect(zip).toHaveBeenCalledTimes(2)
  })

  it('asks to download one by one, or reload, when the ZIP code failed to load twice', async () => {
    zip.mockRejectedValue(fail('load'))
    const button = await ready(locale)
    fireEvent.click(button)
    expect(await screen.findByText(copy.retry)).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.tryAgain })).toBeTruthy()

    fireEvent.click(button)
    expect(await screen.findByText(copy.reload)).toBeTruthy()
    expect(screen.queryByText(copy.retry)).toBeNull()
    // Trying again would not help in every browser, so the notice does not invite it; the photos
    // are still there to download one by one, and the main button still tries.
    expect(screen.queryByRole('button', { name: copy.tryAgain })).toBeNull()
    expect(screen.getAllByRole('link', { name: copy.link })).toHaveLength(2)
    expect(announced(copy.reload)?.getAttribute('role')).toBe('status')

    // Even then, it does not give up: a browser that can load it again lets it work.
    zip.mockResolvedValueOnce(undefined)
    fireEvent.click(button)
    await waitFor(() => expect(screen.queryByText(copy.reload)).toBeNull())
  })

  it('words "too big for one ZIP" like any other failure: it cannot happen with these limits', async () => {
    zip.mockRejectedValue(fail('too-large'))
    fireEvent.click(await ready(locale))
    expect(await screen.findByText(copy.retry)).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.tryAgain })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: copy.link })).toHaveLength(2)
  })
})

describe('what failed', () => {
  it('counts only failures in a row for the same reason', async () => {
    zip
      .mockRejectedValueOnce(fail('load'))
      .mockRejectedValueOnce(fail('failed'))
      .mockRejectedValueOnce(fail('load'))
    const button = await ready()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      fireEvent.click(button)
      await waitFor(() => expect(zip).toHaveBeenCalledTimes(attempt + 1))
      await screen.findByText(COPY.en.retry)
      await waitFor(() => expect(button.getAttribute('aria-busy')).toBeNull())
    }
    expect(screen.queryByText(COPY.en.reload)).toBeNull()
  })

  it('treats anything that is not a ZipError as a failure to try again, without its message', async () => {
    zip.mockRejectedValueOnce(new Error('secret-path.wasm exploded'))
    fireEvent.click(await ready())
    expect(await screen.findByText(COPY.en.retry)).toBeTruthy()
    expect(document.body.textContent).not.toContain('secret-path')
  })

  it('starts clean for another batch, and an old failure never shows over it', async () => {
    let fail: (error: Error) => void = () => {}
    zip.mockReturnValueOnce(new Promise<void>((_, reject) => (fail = reject)))
    const button = await ready('en', ['IMG_0001.jpg', 'IMG_0002.jpg'])
    fireEvent.click(button)
    // While it is working the person starts over with other photos.
    fireEvent.click(await screen.findByRole('button', { name: COPY.en.more }))
    add(photo('IMG_0003.jpg'), photo('IMG_0004.jpg'))
    fireEvent.click(await screen.findByRole('button', { name: COPY.en.compress }))
    await screen.findByRole('button', { name: COPY.en.all })
    // The first one fails now: it is not this batch's failure.
    await act(async () => fail(new ZipError('failed')))
    expect(screen.queryByText(COPY.en.title)).toBeNull()
    expect(screen.getByRole('button', { name: COPY.en.all }).getAttribute('aria-busy')).toBeNull()
  })

  it('clears a failure when the person starts over', async () => {
    zip.mockRejectedValueOnce(fail('failed'))
    fireEvent.click(await ready())
    await screen.findByText(COPY.en.title)
    fireEvent.click(screen.getByRole('button', { name: COPY.en.more }))
    add(photo('IMG_0009.jpg'), photo('IMG_0010.jpg'))
    fireEvent.click(await screen.findByRole('button', { name: COPY.en.compress }))
    await screen.findByRole('button', { name: COPY.en.all })
    expect(screen.queryByText(COPY.en.title)).toBeNull()
  })
})

describe('the Portuguese preparing label', () => {
  it('says it too', async () => {
    zip.mockReturnValue(new Promise(() => {}))
    fireEvent.click(await ready('pt'))
    expect(await screen.findByRole('button', { name: COPY.pt.preparing })).toBeTruthy()
  })
})
