import { describe, it, expect, vi } from 'vitest'
import { openReceipt } from '../openReceipt'

function fakeWindow(blocked = false) {
  const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() }
  const win = { open: vi.fn(() => (blocked ? null : tab)), location: { href: 'app' } }
  return { win: win as unknown as Window, tab, open: win.open, self: win }
}

describe('openReceipt', () => {
  it('opens the tab during the tap, before the URL arrives, then points it at the URL', async () => {
    const { win, tab, open } = fakeWindow()
    let resolve!: (u: string) => void
    const p = openReceipt(() => new Promise(r => { resolve = r }), win)
    expect(open).toHaveBeenCalledTimes(1) // synchronous — what iPhone Safari requires
    expect(tab.opener).toBeNull()
    resolve('https://signed/receipt.pdf')
    await p
    expect(tab.location.href).toBe('https://signed/receipt.pdf')
  })
  it('falls back to the current tab when the popup is blocked anyway', async () => {
    const { win, self } = fakeWindow(true)
    await openReceipt(async () => 'https://signed/x.jpg', win)
    expect(self.location.href).toBe('https://signed/x.jpg')
  })
  it('closes the blank tab and throws when the link fails', async () => {
    const { win, tab } = fakeWindow()
    await expect(openReceipt(async () => null, win)).rejects.toThrow("Couldn't open the receipt")
    expect(tab.close).toHaveBeenCalled()
    const second = fakeWindow()
    await expect(openReceipt(async () => { throw new Error('net') }, second.win)).rejects.toThrow("Couldn't open the receipt")
  })
})
