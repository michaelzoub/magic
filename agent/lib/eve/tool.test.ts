import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserEngine, EngineSnapshot } from '@shared/engine'
import { navigate } from '../tools/browser-tools'
import type { PageDriver, ToolContext } from '../tools/ports'
import { setToolContext } from './context'
import { toEveTool } from './tool'

const snapshot: EngineSnapshot = {
  tabs: [{ id: 'a', url: 'https://a.test', title: 'a', isLoading: false, canGoBack: false, canGoForward: false, isDiscarded: false }],
  activeTabId: 'a'
}

function ctx(): ToolContext {
  return {
    browser: {
      getSnapshot: vi.fn(async () => snapshot),
      navigate: vi.fn(async () => {})
    } as unknown as BrowserEngine,
    page: {} as PageDriver
  }
}

afterEach(() => setToolContext(null))

describe('toEveTool', () => {
  it('reports unavailable without throwing when no host context is injected', async () => {
    const tool = toEveTool(navigate)
    expect(await tool.execute({ url: 'x.com' }, {} as never)).toMatchObject({
      ok: false,
      error: { code: 'unavailable' }
    })
  })

  it('delegates to the runtime-agnostic definition when a context is injected', async () => {
    const c = ctx()
    setToolContext(c)
    const tool = toEveTool(navigate)
    expect(await tool.execute({ url: 'x.com' }, {} as never)).toEqual({ ok: true, data: { tabId: 'a' } })
    expect(c.browser.navigate).toHaveBeenCalledWith('a', 'x.com')
  })
})
