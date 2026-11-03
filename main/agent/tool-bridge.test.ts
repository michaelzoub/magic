import { describe, expect, it, vi } from 'vitest'
import type { BrowserEngine } from '@shared/engine'
import type { PageDriver, ToolContext } from '@agent/lib/tools'
import { dispatchBridgeCall } from './tool-bridge'

function ctx(): ToolContext {
  return {
    browser: {
      getSnapshot: vi.fn(async () => ({ tabs: [], activeTabId: null })),
      createTab: vi.fn(async () => 'new-tab'),
      switchWorkspace: vi.fn(async () => {})
    } as unknown as BrowserEngine,
    page: { getContent: vi.fn(async () => ({ url: 'u', title: 't', text: 'hi', truncated: false })) } as unknown as PageDriver
  }
}

describe('dispatchBridgeCall', () => {
  it('dispatches allowlisted browser and page calls', async () => {
    const c = ctx()
    await expect(dispatchBridgeCall(c, 'browser', 'createTab', ['https://x.test'])).resolves.toBe('new-tab')
    expect(c.browser.createTab).toHaveBeenCalledWith('https://x.test')
    await expect(dispatchBridgeCall(c, 'page', 'getContent', ['a', { maxLength: 10 }])).resolves.toMatchObject({ text: 'hi' })
  })

  it('rejects non-allowlisted methods, including switchWorkspace', async () => {
    const c = ctx()
    await expect(dispatchBridgeCall(c, 'browser', 'switchWorkspace', ['w', [], 0])).rejects.toMatchObject({ code: 'forbidden' })
    await expect(dispatchBridgeCall(c, 'browser', 'capturePage', ['a'])).rejects.toMatchObject({ code: 'forbidden' })
    await expect(dispatchBridgeCall(c, 'nope', 'createTab', [])).rejects.toMatchObject({ code: 'forbidden' })
    expect(c.browser.switchWorkspace).not.toHaveBeenCalled()
  })
})
