/**
 * Browser engine contract.
 *
 * The UI only ever talks to this interface. Implementations live behind it:
 * today Electron (WebContentsView), later CEF or a Chromium fork. A future
 * agent runtime should drive the browser through this same surface.
 */

export type TabId = string

export interface TabState {
  id: TabId
  url: string
  title: string
  favicon?: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** Unloaded to save memory; reloads transparently when activated. */
  isDiscarded: boolean
}

export interface EngineSnapshot {
  tabs: TabState[]
  activeTabId: TabId | null
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserEngine {
  getSnapshot(): Promise<EngineSnapshot>
  subscribe(listener: (snapshot: EngineSnapshot) => void): () => void

  createTab(url?: string): Promise<TabId>
  closeTab(id: TabId): Promise<void>
  activateTab(id: TabId): Promise<void>

  navigate(id: TabId, input: string): Promise<void>
  goBack(id: TabId): Promise<void>
  goForward(id: TabId): Promise<void>
  reload(id: TabId): Promise<void>
  stop(id: TabId): Promise<void>

  /** Hint that the user may navigate to `input` soon (DNS + TCP/TLS warm-up). */
  preconnect(input: string): void

  /** Where the native page surface should render, in window CSS pixels. */
  setViewportBounds(bounds: Bounds): void
}

/** IPC channel names shared by main and preload. */
export const IPC = {
  invoke: 'engine:invoke',
  bounds: 'engine:bounds',
  preconnect: 'engine:preconnect',
  snapshot: 'engine:snapshot'
} as const

export type EngineCommand = Exclude<keyof BrowserEngine, 'subscribe' | 'setViewportBounds' | 'preconnect'>

/** Turns URL-bar input into a navigable URL (or a search). */
export function normalizeInput(input: string): string {
  const text = input.trim()
  if (!text) return 'about:blank'
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text
  if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/i.test(text)) return `https://${text}`
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`
}
