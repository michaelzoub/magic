/**
 * Ports the tool layer depends on. Implementations (Electron, test fakes)
 * live outside `agent/tools`; nothing here may import Electron or an agent runtime.
 */
import type { BrowserEngine, TabId } from '@shared/engine'
import type { BrowserStore } from '@core/workspaces'

export interface PageElement {
  /** Index within the query result; stable only until the page changes. */
  index: number
  tag: string
  text: string
  attributes: Record<string, string>
  visible: boolean
}

export interface PageContent {
  url: string
  title: string
  text: string
  /** True when `text` was cut at `maxLength`. */
  truncated: boolean
}

/** In-page operations (DOM read/interaction), backed by WebContents/CDP. */
export interface PageDriver {
  getContent(tabId: TabId, opts: { maxLength: number }): Promise<PageContent>
  query(tabId: TabId, selector: string, opts: { limit: number }): Promise<PageElement[]>
  /** Clicks the `index`th match of `selector`. Rejects if no such element. */
  click(tabId: TabId, selector: string, index: number): Promise<void>
  /** Focuses the `index`th match of `selector` and enters `text`. */
  type(tabId: TabId, selector: string, index: number, text: string, opts: { clear: boolean; submit: boolean }): Promise<void>
}

/** A workspace as tools see it. */
export interface WorkspaceSummary {
  id: string
  name: string
  /** What the user wants to get done in this workspace. */
  goal: string
  active: boolean
}

/**
 * Async workspace access for contexts without a local `BrowserStore` (the
 * Electron host, where the store lives in the renderer).
 */
export interface WorkspaceDirectory {
  list(): Promise<WorkspaceSummary[]>
  /** Makes `workspaceId` active. Rejects with `not_found` for an unknown id. */
  switchTo(workspaceId: string): Promise<void>
}

/** Everything a tool may touch. The store is optional; without it, ownership is not enforced. */
export interface ToolContext {
  browser: BrowserEngine
  page: PageDriver
  store?: BrowserStore
  /** Used by workspace tools when no `store` is wired. */
  workspaces?: WorkspaceDirectory
}
