import { normalizeInput, type BrowserEngine, type EngineSnapshot, type TabState } from '@shared/engine'

/** UI-only engine with no rendering. Lets the shell run in a regular browser tab. */
export function createMemoryEngine(): BrowserEngine {
  let snap: EngineSnapshot = { tabs: [], activeTabId: null }
  const listeners = new Set<(s: EngineSnapshot) => void>()
  const set = (next: EngineSnapshot) => {
    snap = next
    listeners.forEach((l) => l(snap))
  }
  const patch = (id: string, p: Partial<TabState>) =>
    set({ ...snap, tabs: snap.tabs.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const noop = async () => {}

  const engine: BrowserEngine = {
    getSnapshot: async () => snap,
    subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
    async createTab(url) {
      const id = crypto.randomUUID()
      const tab: TabState = { id, url: '', title: 'New Tab', isLoading: false, canGoBack: false, canGoForward: false, isDiscarded: false }
      set({ tabs: [...snap.tabs, tab], activeTabId: id })
      if (url) await engine.navigate(id, url)
      return id
    },
    async closeTab(id) {
      const i = snap.tabs.findIndex((t) => t.id === id)
      const tabs = snap.tabs.filter((t) => t.id !== id)
      const activeTabId = snap.activeTabId === id ? (tabs[Math.min(i, tabs.length - 1)]?.id ?? null) : snap.activeTabId
      set({ tabs, activeTabId })
      if (!tabs.length) await engine.createTab()
    },
    activateTab: async (id) => set({ ...snap, activeTabId: id }),
    async navigate(id, input) {
      const url = normalizeInput(input)
      patch(id, { url, title: new URL(url).hostname || url })
    },
    goBack: noop,
    goForward: noop,
    reload: noop,
    stop: noop,
    preconnect: () => {},
    setViewportBounds: () => {}
  }
  void engine.createTab()
  return engine
}
