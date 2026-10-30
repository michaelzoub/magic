import { describe, expect, it, vi } from 'vitest'
import type { BrowserEngine, EngineSnapshot, TabState } from '@shared/engine'
import type { TabAssignmentService, Workspace, WorkspaceService } from '../workspaces'
import type { PageDriver, ToolContext } from './ports'
import { createToolRegistry } from './registry'

const tab = (id: string, extra: Partial<TabState> = {}): TabState => ({
  id, url: `https://${id}.test`, title: id, isLoading: false,
  canGoBack: false, canGoForward: false, isDiscarded: false, ...extra
})

function fakeBrowser(snapshot: EngineSnapshot): BrowserEngine {
  return {
    getSnapshot: vi.fn(async () => snapshot),
    createTab: vi.fn(async () => 'new'),
    closeTab: vi.fn(async () => {}),
    activateTab: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    goBack: vi.fn(async () => {}),
    goForward: vi.fn(async () => {})
  } as unknown as BrowserEngine
}

const fakePage = (): PageDriver => ({
  getContent: vi.fn(async () => ({ url: 'u', title: 't', text: 'hi', truncated: false })),
  query: vi.fn(async () => []),
  click: vi.fn(async () => {}),
  type: vi.fn(async () => {})
})

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    browser: fakeBrowser({ tabs: [tab('a', { canGoBack: true }), tab('b')], activeTabId: 'a' }),
    page: fakePage(),
    source: { kind: 'agent', agentId: 'test' },
    ...overrides
  }
}

function workspaceCtx(): ToolContext {
  const ws: Workspace[] = [
    { id: 'w1', name: 'Work', status: 'active', sites: new Map() },
    { id: 'w2', name: 'Home', status: 'background', sites: new Map() }
  ]
  const owner: Record<string, string> = { a: 'w1', b: 'w2' }
  const workspaces = {
    list: vi.fn(async () => ws),
    get: vi.fn(async (id: string) => ws.find((w) => w.id === id) ?? null),
    getActive: vi.fn(async () => ws.find((w) => w.status === 'active') ?? null),
    switchTo: vi.fn(async (id: string) => ws.find((w) => w.id === id)!)
  } as unknown as WorkspaceService
  const tabAssignments = {
    assign: vi.fn(async (tabId: string, workspaceId: string) => ({ tabId, workspaceId })),
    unassign: vi.fn(async () => {}),
    getWorkspaceForTab: vi.fn(async (id: string) => owner[id] ?? null),
    listTabs: vi.fn(async (w: string) => Object.keys(owner).filter((t) => owner[t] === w))
  } as unknown as TabAssignmentService
  return ctx({ workspaces, tabAssignments })
}

const registry = createToolRegistry()

describe('tool registry', () => {
  it('registers all initial tools with unique names', () => {
    expect(registry.list().map((t) => t.name).sort()).toEqual([
      'click_element', 'close_tab', 'get_active_tab', 'get_page_content', 'go_back', 'go_forward',
      'list_tabs', 'list_workspaces', 'navigate', 'open_tab', 'query_elements', 'switch_tab',
      'switch_workspace', 'type_text'
    ])
  })

  it('rejects unknown tools and invalid input without throwing', async () => {
    expect(await registry.execute('nope', {}, ctx())).toMatchObject({ ok: false, error: { code: 'not_found' } })
    expect(await registry.execute('navigate', { url: '' }, ctx())).toMatchObject({ ok: false, error: { code: 'invalid_input' } })
  })

  it('wraps unexpected errors as failed', async () => {
    const c = ctx()
    vi.mocked(c.browser.navigate).mockRejectedValue(new Error('boom'))
    expect(await registry.execute('navigate', { url: 'x.com' }, c)).toEqual({ ok: false, error: { code: 'failed', message: 'boom' } })
  })
})

describe('browser tools', () => {
  it('defaults to the active tab', async () => {
    const c = ctx()
    expect(await registry.execute('navigate', { url: 'x.com' }, c)).toEqual({ ok: true, data: { tabId: 'a' } })
    expect(c.browser.navigate).toHaveBeenCalledWith('a', 'x.com')
  })

  it('reports not_found for unknown tabs', async () => {
    expect(await registry.execute('switch_tab', { tabId: 'zzz' }, ctx())).toMatchObject({ ok: false, error: { code: 'not_found' } })
  })

  it('only navigates history when possible', async () => {
    const c = ctx()
    expect(await registry.execute('go_back', {}, c)).toEqual({ ok: true, data: { tabId: 'a', navigated: true } })
    expect(await registry.execute('go_forward', {}, c)).toEqual({ ok: true, data: { tabId: 'a', navigated: false } })
    expect(c.browser.goForward).not.toHaveBeenCalled()
  })

  it('applies schema defaults for page tools', async () => {
    const c = ctx()
    await registry.execute('type_text', { selector: 'input', text: 'hi' }, c)
    expect(c.page.type).toHaveBeenCalledWith('a', 'input', 0, 'hi', { clear: true, submit: false })
  })
})

describe('workspace ownership', () => {
  it('lists only tabs in the active workspace', async () => {
    const res = await registry.execute('list_tabs', {}, workspaceCtx())
    expect(res).toMatchObject({ ok: true, data: { activeTabId: 'a', tabs: [{ id: 'a' }] } })
  })

  it('forbids acting on another workspace\'s tab', async () => {
    const c = workspaceCtx()
    expect(await registry.execute('close_tab', { tabId: 'b' }, c)).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(c.browser.closeTab).not.toHaveBeenCalled()
  })

  it('assigns opened tabs to the active workspace', async () => {
    const c = workspaceCtx()
    await registry.execute('open_tab', { url: 'x.com' }, c)
    expect(c.tabAssignments!.assign).toHaveBeenCalledWith('new', 'w1', c.source)
  })

  it('lists and switches workspaces', async () => {
    const c = workspaceCtx()
    expect(await registry.execute('list_workspaces', {}, c)).toMatchObject({ ok: true, data: { workspaces: [{ id: 'w1', active: true }, { id: 'w2', active: false }] } })
    expect(await registry.execute('switch_workspace', { workspaceId: 'w2' }, c)).toMatchObject({ ok: true })
    expect(c.workspaces!.switchTo).toHaveBeenCalledWith('w2', c.source)
    expect(await registry.execute('switch_workspace', { workspaceId: 'nope' }, c)).toMatchObject({ ok: false, error: { code: 'not_found' } })
  })

  it('reports unavailable when workspaces are not wired', async () => {
    expect(await registry.execute('list_workspaces', {}, ctx())).toMatchObject({ ok: false, error: { code: 'unavailable' } })
  })
})
