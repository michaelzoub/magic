/**
 * Ports the tool layer depends on. Implementations (Electron, test fakes…)
 * live outside `core/tools`; nothing here may import Electron or an agent runtime.
 */
import type { BrowserEngine, TabId } from '@shared/engine'
import type { ChangeSource, TabAssignmentService, WorkspaceService } from '../workspaces'

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

/** Everything a tool may touch. Workspace services are optional; without them, ownership is not enforced. */
export interface ToolContext {
  browser: BrowserEngine
  page: PageDriver
  workspaces?: WorkspaceService
  tabAssignments?: TabAssignmentService
  /** Attributed on workspace changes made by tools. */
  source: ChangeSource
}
