import { BrowserWindow, WebContentsView } from 'electron'
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
  view: WebContentsView
}

/** Electron/Chromium implementation of BrowserEngine. One instance per window. */
export class ElectronEngine implements BrowserEngine {
  private tabs = new Map<TabId, Tab>()
  private order: TabId[] = []
  private activeTabId: TabId | null = null
  private bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 }
  private listeners = new Set<(s: EngineSnapshot) => void>()

  constructor(private window: BrowserWindow) {}

  async getSnapshot(): Promise<EngineSnapshot> {
    return this.snapshot()
  }

  subscribe(listener: (s: EngineSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async createTab(url?: string): Promise<TabId> {
    const id = randomUUID()
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true }
    })
    view.setBorderRadius?.(8)
    const tab: Tab = {
      view,
      state: { id, url: '', title: 'New Tab', isLoading: false, canGoBack: false, canGoForward: false }
    }
    this.tabs.set(id, tab)
    this.order.push(id)
    this.wire(tab)
    await this.activateTab(id)
    if (url) await this.navigate(id, url)
    else this.emit()
    return id
  }

  async closeTab(id: TabId): Promise<void> {
    const tab = this.tabs.get(id)
    if (!tab) return
    const index = this.order.indexOf(id)
    this.window.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
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
    if (!this.tabs.has(id)) return
    this.activeTabId = id
    this.layout()
    this.emit()
  }

  async navigate(id: TabId, input: string): Promise<void> {
    const tab = this.tabs.get(id)
    if (!tab) return
    const url = normalizeInput(input)
    tab.state.url = url
    this.layout()
    this.emit()
    tab.view.webContents.loadURL(url).catch(() => {})
  }

  async goBack(id: TabId) {
    this.tabs.get(id)?.view.webContents.navigationHistory.goBack()
  }
  async goForward(id: TabId) {
    this.tabs.get(id)?.view.webContents.navigationHistory.goForward()
  }
  async reload(id: TabId) {
    this.tabs.get(id)?.view.webContents.reload()
  }
  async stop(id: TabId) {
    this.tabs.get(id)?.view.webContents.stop()
  }

  setViewportBounds(bounds: Bounds): void {
    this.bounds = bounds
    this.layout()
  }

  dispose(): void {
    this.listeners.clear()
    for (const { view } of this.tabs.values()) view.webContents.close()
    this.tabs.clear()
  }

  /** Only the active tab with real content is attached; blank tabs show the shell's empty state. */
  private layout(): void {
    for (const [id, { view, state }] of this.tabs) {
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

  private wire({ view, state }: Tab): void {
    const wc = view.webContents
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

  private emit(): void {
    const s = this.snapshot()
    for (const l of this.listeners) l(s)
  }
}
