import { describe, expect, it, vi } from 'vitest'
import type { AgentTabProposal } from '@shared/agent'
import type { BrowserEngine, TabState } from '@shared/engine'
import type { ToolContext } from '@agent/lib/tools'
import { createStagedToolContext } from './staged-context'

const tab = (id: string): TabState => ({
  id, url: `https://${id}.test`, title: `Tab ${id}`, isLoading: false,
  canGoBack: false, canGoForward: false, isDiscarded: false
})

function baseCtx() {
  const browser = {
    getSnapshot: vi.fn(async () => ({ tabs: [tab('a'), tab('b')], activeTabId: 'a' })),
    subscribe: () => () => {},
    createTab: vi.fn(async () => 'real-new'),
    closeTab: vi.fn(async () => {}),
    activateTab: vi.fn(async () => {}),
    navigate: vi.fn(async () => {})
  } as unknown as BrowserEngine
  const ctx = {
    browser,
    page: {
      getContent: vi.fn(async () => ({ url: 'u', title: 't', text: '', truncated: false })),
      query: vi.fn(async () => []),
      click: vi.fn(async () => {}),
      type: vi.fn(async () => {})
    }
  } as unknown as ToolContext
  return ctx
}

describe('createStagedToolContext', () => {
  it('stages open/close/navigate as proposals and never mutates the real browser', async () => {
    const base = baseCtx()
    const proposals: AgentTabProposal[] = []
    const staged = createStagedToolContext(base, proposals)

    const openedId = await staged.browser.createTab('https://example.com/docs')
    await staged.browser.closeTab('a')
    await staged.browser.navigate('b', 'https://example.com/other')
    await staged.browser.activateTab('b')

    expect(base.browser.createTab).not.toHaveBeenCalled()
    expect(base.browser.closeTab).not.toHaveBeenCalled()
    expect(base.browser.navigate).not.toHaveBeenCalled()
    expect(base.browser.activateTab).not.toHaveBeenCalled()
    expect(proposals).toEqual([
      { kind: 'open', url: 'https://example.com/docs' },
      { kind: 'close', tabId: 'a', title: 'Tab a', url: 'https://a.test' },
      { kind: 'navigate', tabId: 'b', title: 'Tab b', url: 'https://example.com/other' }
    ])

    // The agent's view reflects its staged changes.
    const snap = await staged.browser.getSnapshot()
    expect(snap.tabs.map((t) => t.id)).toContain(openedId)
    expect(snap.tabs.map((t) => t.id)).not.toContain('a')
    expect(snap.tabs.find((t) => t.id === 'b')?.url).toBe('https://example.com/other')
  })

  it('dedupes opens/closes and dropping a staged open removes its proposal', async () => {
    const base = baseCtx()
    const proposals: AgentTabProposal[] = []
    const staged = createStagedToolContext(base, proposals)
    const id = await staged.browser.createTab('https://example.com')
    await staged.browser.createTab('https://example.com')
    await staged.browser.closeTab('a')
    await staged.browser.closeTab('a')
    expect(proposals).toHaveLength(2)
    await staged.browser.closeTab(id)
    expect(proposals).toEqual([{ kind: 'close', tabId: 'a', title: 'Tab a', url: 'https://a.test' }])
  })

  it('refuses page interaction while staging', async () => {
    const proposals: AgentTabProposal[] = []
    const staged = createStagedToolContext(baseCtx(), proposals)
    await expect(staged.page.click('a', 'button', 0)).rejects.toThrow(/not available/)
  })
})
