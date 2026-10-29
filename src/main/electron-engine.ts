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
}

/** Background tabs idle longer than this are unloaded. */
const DISCARD_AFTER_MS = 10 * 60_000
const EMIT_INTERVAL_MS = 16

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
    const id = randomUUID()
    const tab: Tab = {
      view: this.takeView(),
      lastActive: Date.now(),
      state: {
        id, url: '', title: 'New Tab', isLoading: false,
        canGoBack: false, canGoForward: false, isDiscarded: false
      }
    }
    this.tabs.set(id, tab)
    this.order.push(id)
    this.wire(tab)
    await this.activateTab(id)
    if (url) await this.navigate(id, url)
    return id
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
      const next = this.order[Math.min(index, this.order.length - 1)]
      if (next) await this.activateTab(next)
    }
    if (this.order.length === 0) await this.createTab()
    else this.emit()
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
      if (tab.view?.webContents.isCurrentlyAudible()) continue
      this.destroyView(tab)
      Object.assign(tab.state, { isDiscarded: true, isLoading: false })
    }
    this.emit()
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
      tabs: this.order.map((id) => ({ ...this.tabs.get(id)!.state })),
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
