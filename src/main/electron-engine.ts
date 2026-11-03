import { BrowserWindow, WebContentsView, session, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import {
  normalizeInput,
  type BrowserEngine,
  type Bounds,
  type EngineSnapshot,
  type TabId,
  type TabState
} from '@shared/engine'

interface Tab {
  state: TabState
  view: WebContentsView | null
  lastActive: number
  workspaceId: string
}

/** Background tabs idle longer than this are unloaded. */
const DISCARD_AFTER_MS = 10 * 60_000
const EMIT_INTERVAL_MS = 16
/** Workspaces whose pages stay loaded in the background; older ones are unloaded. */
const MAX_LIVE_WORKSPACES = 3
/** Owner of tabs opened before any workspace switch (the blank startup tab). */
const NO_WORKSPACE = ''

function createView(): WebContentsView {
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: true, spellcheck: false }
  })
  view.setBackgroundColor('#ffffff')
  return view
}

/** Electron/Chromium implementation of BrowserEngine. One instance per window. */
export class ElectronEngine implements BrowserEngine {
  private tabs = new Map<TabId, Tab>()
  private order: TabId[] = []
  private activeTabId: TabId | null = null
  private bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 }
  private listeners = new Set<(s: EngineSnapshot) => void>()
  private spare: WebContentsView | null = null
  private emitTimer: NodeJS.Timeout | null = null
  private discardTimer: NodeJS.Timeout
  private activeWorkspace = NO_WORKSPACE
  /** Workspace ids, most recently active first. */
  private recentWorkspaces: string[] = []

  constructor(private window: BrowserWindow) {
    this.discardTimer = setInterval(() => this.discardIdleTabs(), 60_000)
  }

  async getSnapshot(): Promise<EngineSnapshot> {
    return this.snapshot()
  }

  subscribe(listener: (s: EngineSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async createTab(url?: string): Promise<TabId> {
    const id = this.addTab(url)
    await this.activateTab(id)
    return id
  }

  /** Registers a tab in the active workspace without focusing it; `url` loads on first activation. */
  private addTab(url?: string, saved?: { title?: string; favicon?: string }): TabId {
    const id = randomUUID()
    const tab: Tab = {
      // With a URL the tab starts unloaded and gets a view on first activation.
      view: url ? null : this.takeView(),
      lastActive: Date.now(),
      workspaceId: this.activeWorkspace,
      state: {
        id, url: '', title: 'New Tab', isLoading: false,
        canGoBack: false, canGoForward: false, isDiscarded: false
      }
    }
    this.tabs.set(id, tab)
    this.order.push(id)
    if (url) Object.assign(tab.state, { url: normalizeInput(url), title: saved?.title || url, favicon: saved?.favicon, isDiscarded: true })
    else this.wire(tab)
    return id
  }

  private removeTab(id: TabId): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    this.destroyView(tab)
    this.tabs.delete(id)
    this.order.splice(this.order.indexOf(id), 1)
    if (this.activeTabId === id) this.activeTabId = null
  }

  /** Unloads every tab of workspaces beyond the most recent MAX_LIVE_WORKSPACES. */
  private evictStaleWorkspaces(): void {
    const stale = new Set(this.recentWorkspaces.slice(MAX_LIVE_WORKSPACES))
    for (const tab of this.tabs.values()) {
      if (stale.has(tab.workspaceId)) this.discard(tab)
    }
    this.emit()
  }

  private visibleIds(): TabId[] {
    return this.order.filter((t) => this.tabs.get(t)!.workspaceId === this.activeWorkspace)
  }

  async closeTab(id: TabId): Promise<void> {
    const tab = this.tabs.get(id)
    if (!tab) return
    const index = this.order.indexOf(id)
    this.destroyView(tab)
    this.tabs.delete(id)
    this.order.splice(index, 1)

    if (this.activeTabId === id) {
      this.activeTabId = null
      const siblings = this.order.filter((t) => this.tabs.get(t)!.workspaceId === tab.workspaceId)
      const next = this.order.slice(index).find((t) => siblings.includes(t)) ?? siblings.at(-1)
      if (next) await this.activateTab(next)
    }
    if (this.visibleIds().length === 0) await this.createTab()
    else this.emit()
  }

  async switchWorkspace(workspaceId: string, tabs: readonly { url: string; title?: string; favicon?: string }[], activeIndex: number, reset = false): Promise<void> {
    const previous = this.activeWorkspace
    const current = this.activeTabId && this.tabs.get(this.activeTabId)
    if (current) current.lastActive = Date.now()

    this.activeWorkspace = workspaceId
    this.activeTabId = null
    this.recentWorkspaces = [workspaceId, ...this.recentWorkspaces.filter((w) => w !== workspaceId)]

    const owned = (w: string) => this.order.filter((t) => this.tabs.get(t)!.workspaceId === w)
    // The startup tab belongs to no workspace; drop it once a real one opens.
    if (previous === NO_WORKSPACE && workspaceId !== NO_WORKSPACE) for (const t of owned(NO_WORKSPACE)) this.removeTab(t)
    if (reset) for (const t of owned(workspaceId)) this.removeTab(t)

    let ids = owned(workspaceId)
    if (ids.length === 0) {
      // Cold: never opened here, or reset. Views are created now; only the active one loads below.
      for (const t of tabs) ids.push(this.addTab(t.url, t))
      if (ids.length === 0) ids.push(this.addTab())
    }
    // Warm workspaces keep their views: activating just re-attaches, no reload.
    await this.activateTab(ids[Math.min(Math.max(activeIndex, 0), ids.length - 1)])
    this.evictStaleWorkspaces()
  }

  async activateTab(id: TabId): Promise<void> {
    const tab = this.tabs.get(id)
    if (!tab) return
    const previous = this.activeTabId && this.tabs.get(this.activeTabId)
    if (previous) previous.lastActive = Date.now()
    tab.lastActive = Date.now()
    this.activeTabId = id
    if (tab.state.isDiscarded) this.restore(tab)
    this.layout()
    this.emit()
  }

  async navigate(id: TabId, input: string): Promise<void> {
    const tab = this.tabs.get(id)
    if (!tab?.view) return
    const url = normalizeInput(input)
    tab.state.url = url
    this.layout()
    this.emit()
    tab.view.webContents.loadURL(url).catch(() => {})
  }

  async goBack(id: TabId) {
    this.tabs.get(id)?.view?.webContents.navigationHistory.goBack()
  }
  async goForward(id: TabId) {
    this.tabs.get(id)?.view?.webContents.navigationHistory.goForward()
  }
  async reload(id: TabId) {
    this.tabs.get(id)?.view?.webContents.reload()
  }
  async stop(id: TabId) {
    this.tabs.get(id)?.view?.webContents.stop()
  }

  async capturePage(id: TabId): Promise<string | null> {
    const tab = this.tabs.get(id)
    if (!tab?.view || !tab.state.url) return null
    try {
      const image = await tab.view.webContents.capturePage()
      return image.isEmpty() ? null : image.toDataURL()
    } catch {
      return null
    }
  }

  preconnect(input: string): void {
    const url = normalizeInput(input)
    if (!/^https?:/.test(url)) return
    session.defaultSession.preconnect({ url, numSockets: 1 })
  }

  setViewportBounds(bounds: Bounds): void {
    this.bounds = bounds
    this.layout()
  }

  /** Live WebContents for a tab, or null if it's unknown or discarded. Integration-layer only. */
  webContentsFor(id: TabId): WebContents | null {
    return this.tabs.get(id)?.view?.webContents ?? null
  }

  dispose(): void {
    clearInterval(this.discardTimer)
    if (this.emitTimer) clearTimeout(this.emitTimer)
    this.listeners.clear()
    for (const tab of this.tabs.values()) this.destroyView(tab)
    this.spare?.webContents.close()
    this.tabs.clear()
  }

  /** Hands out the pre-warmed view and warms the next one when idle. */
  private takeView(): WebContentsView {
    const view = this.spare ?? createView()
    this.spare = null
    setTimeout(() => {
      if (!this.spare && !this.window.isDestroyed()) this.spare = createView()
    }, 500)
    return view
  }

  private destroyView(tab: Tab): void {
    if (!tab.view) return
    if (this.window.contentView.children.includes(tab.view)) this.window.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
    tab.view = null
  }

  private discardIdleTabs(): void {
    const cutoff = Date.now() - DISCARD_AFTER_MS
    for (const [id, tab] of this.tabs) {
      if (id === this.activeTabId || tab.state.isDiscarded || !tab.state.url || tab.lastActive > cutoff) continue
      this.discard(tab)
    }
    this.emit()
  }

  /** Frees a tab's renderer process, keeping its URL so activation reloads it. Audible tabs are spared. */
  private discard(tab: Tab): void {
    if (tab.state.isDiscarded || !tab.state.url || tab.state.id === this.activeTabId) return
    if (tab.view?.webContents.isCurrentlyAudible()) return
    this.destroyView(tab)
    Object.assign(tab.state, { isDiscarded: true, isLoading: false })
  }

  private restore(tab: Tab): void {
    tab.view = this.takeView()
    tab.state.isDiscarded = false
    this.wire(tab)
    tab.view.webContents.loadURL(tab.state.url).catch(() => {})
  }

  /** Only the active tab with real content is attached; blank tabs show the shell's empty state. */
  private layout(): void {
    for (const [id, { view, state }] of this.tabs) {
      if (!view) continue
      const visible = id === this.activeTabId && state.url !== '' && this.bounds.width > 0
      const attached = this.window.contentView.children.includes(view)
      if (visible) {
        if (!attached) this.window.contentView.addChildView(view)
        view.setBounds(this.bounds)
      } else if (attached) {
        this.window.contentView.removeChildView(view)
      }
    }
  }

  private wire(tab: Tab): void {
    const { state } = tab
    const wc = tab.view!.webContents
    const sync = () => {
      if (wc.isDestroyed()) return
      state.url = wc.getURL() || state.url
      state.title = wc.getTitle() || state.url || 'New Tab'
      state.isLoading = wc.isLoading()
      state.canGoBack = wc.navigationHistory.canGoBack()
      state.canGoForward = wc.navigationHistory.canGoForward()
      this.emit()
    }
    wc.on('did-start-loading', sync)
    wc.on('did-stop-loading', sync)
    wc.on('did-navigate', sync)
    wc.on('did-navigate-in-page', sync)
    wc.on('page-title-updated', sync)
    wc.on('page-favicon-updated', (_e, icons) => {
      state.favicon = icons[0]
      this.emit()
    })
    wc.setWindowOpenHandler(({ url }) => {
      this.createTab(url)
      return { action: 'deny' }
    })
  }

  private snapshot(): EngineSnapshot {
    return {
      tabs: this.visibleIds().map((id) => ({ ...this.tabs.get(id)!.state })),
      activeTabId: this.activeTabId
    }
  }

  /** Coalesces bursts of page events into at most one UI update per frame. */
  private emit(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      const s = this.snapshot()
      for (const l of this.listeners) l(s)
    }, EMIT_INTERVAL_MS)
  }
}
