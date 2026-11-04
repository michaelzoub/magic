/**
 * Staging wrapper for workspace-switch runs: the agent plans against the
 * live tab list, but its mutating browser calls never touch the engine.
 * `createTab`/`closeTab`/`navigate` are recorded as {@link AgentTabProposal}s
 * (and reflected in the snapshot the agent sees, so its later `list_tabs`
 * matches what it "did"), navigation/activation are no-ops, and page
 * interactions are refused. The user approves or discards the proposals
 * when the run concludes; only then does the shell enact them.
 */
import type { AgentTabProposal } from '@shared/agent'
import type { BrowserEngine, EngineSnapshot, TabState } from '@shared/engine'
import type { ToolContext } from '@agent/lib/tools'

const STAGED_PREFIX = 'staged:'

export function isStagedTabId(id: string): boolean {
  return id.startsWith(STAGED_PREFIX)
}

export function createStagedToolContext(base: ToolContext, proposals: AgentTabProposal[]): ToolContext {
  let seq = 0
  const stagedIdFor = (url: string): string => {
    const at = proposals.findIndex((p) => p.kind === 'open' && p.url === url)
    return at >= 0 ? `${STAGED_PREFIX}${at}` : `${STAGED_PREFIX}new-${++seq}`
  }

  const snapshot = async (): Promise<EngineSnapshot> => {
    const real = await base.browser.getSnapshot()
    const closed = new Set(proposals.flatMap((p) => (p.kind === 'close' ? [p.tabId] : [])))
    const navigated = new Map(proposals.flatMap((p) => (p.kind === 'navigate' ? [[p.tabId, p.url] as const] : [])))
    const tabs: TabState[] = real.tabs
      .filter((t) => !closed.has(t.id))
      .map((t) => (navigated.has(t.id) ? { ...t, url: navigated.get(t.id)! } : t))
    proposals.forEach((p, i) => {
      if (p.kind !== 'open') return
      tabs.push({
        id: `${STAGED_PREFIX}${i}`,
        url: p.url,
        title: p.url,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        isDiscarded: false
      })
    })
    const activeTabId = real.activeTabId && !closed.has(real.activeTabId) ? real.activeTabId : (tabs[0]?.id ?? null)
    return { tabs, activeTabId }
  }

  const browser: BrowserEngine = {
    getSnapshot: snapshot,
    subscribe: () => () => {},
    async createTab(url?: string) {
      const target = (url ?? '').trim()
      const existing = proposals.find((p) => p.kind === 'open' && p.url === target)
      if (!existing) proposals.push({ kind: 'open', url: target })
      return stagedIdFor(target)
    },
    async closeTab(id: string) {
      if (isStagedTabId(id)) {
        // Closing a tab the agent itself staged for opening just drops it.
        const at = Number(id.slice(STAGED_PREFIX.length))
        if (Number.isInteger(at) && proposals[at]?.kind === 'open') proposals.splice(at, 1)
        return
      }
      if (proposals.some((p) => p.kind === 'close' && p.tabId === id)) return
      const tab = (await base.browser.getSnapshot()).tabs.find((t) => t.id === id)
      proposals.push({ kind: 'close', tabId: id, title: tab?.title ?? '', url: tab?.url ?? '' })
    },
    async activateTab() {
      // Focus changes are part of enactment, not planning.
    },
    async moveTab() {
      throw new Error('moveTab is not available during a workspace-switch run')
    },
    async switchWorkspace() {
      throw new Error('switchWorkspace is not available during a workspace-switch run')
    },
    async navigate(id: string, input: string) {
      if (isStagedTabId(id)) {
        const at = Number(id.slice(STAGED_PREFIX.length))
        const open = proposals[at]
        if (open?.kind === 'open') open.url = input
        return
      }
      const tab = (await base.browser.getSnapshot()).tabs.find((t) => t.id === id)
      const existing = proposals.findIndex((p) => p.kind === 'navigate' && p.tabId === id)
      const proposal: AgentTabProposal = { kind: 'navigate', tabId: id, title: tab?.title ?? '', url: input }
      if (existing >= 0) proposals[existing] = proposal
      else proposals.push(proposal)
    },
    async goBack() {},
    async goForward() {},
    async reload() {},
    async stop() {},
    preconnect: () => {},
    setViewportBounds: () => {}
  }

  return {
    ...base,
    browser,
    page: {
      getContent: (tabId, opts) => base.page.getContent(tabId, opts),
      query: (tabId, selector, opts) => base.page.query(tabId, selector, opts),
      click: () => Promise.reject(new Error('Page interaction is not available during a workspace-switch run; propose tab changes instead')),
      type: () => Promise.reject(new Error('Page interaction is not available during a workspace-switch run; propose tab changes instead'))
    }
  }
}
