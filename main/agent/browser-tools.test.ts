import { describe, expect, it, vi } from 'vitest'
import type { ElectronEngine } from '../browser/electron-engine'
import { createElectronToolContext } from './browser-tools'

const fakeEngine = (closeTab: (id: string) => Promise<void>) =>
  ({
    getSnapshot: async () => ({ tabs: [], activeTabId: null }),
    subscribe: () => () => {},
    createTab: async () => 'new',
    closeTab,
    activateTab: async () => {},
    moveTab: async () => {},
    switchWorkspace: async () => {},
    navigate: async () => {},
    goBack: async () => {},
    goForward: async () => {},
    reload: async () => {},
    stop: async () => {},
    preconnect: () => {},
    setViewportBounds: () => {},
    webContentsFor: () => null
  }) as unknown as ElectronEngine

describe('createElectronToolContext', () => {
  it('awaits the tab-closing notice before closing, so the shell can highlight the tab first', async () => {
    const order: string[] = []
    const ctx = createElectronToolContext(fakeEngine(async () => { order.push('close') }), {
      onTabClosing: async () => { order.push('notice') }
    })
    await ctx.browser.closeTab('khan')
    expect(order).toEqual(['notice', 'close'])
  })

  it('still closes when no notice hook is wired', async () => {
    const closeTab = vi.fn(async () => {})
    const ctx = createElectronToolContext(fakeEngine(closeTab))
    await ctx.browser.closeTab('khan')
    expect(closeTab).toHaveBeenCalledWith('khan')
  })
})
