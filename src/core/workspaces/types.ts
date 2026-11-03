/**
 * Core workspace data models. Pure data — no Electron, Chromium, React, or
 * agent-framework dependencies may be imported anywhere in `core/workspaces`.
 */

export type WorkspaceId = string
export type TabId = string
/** Normalized site key (e.g. registrable domain `github.com`). */
export type SiteKey = string

/** Site → usage probability (0–1) within one workspace. */
export type SiteMap = Map<SiteKey, number>

export interface Workspace {
  id: WorkspaceId
  /** Unique across workspaces (compared trimmed, case-insensitive). */
  name: string
  /** What this workspace is for, e.g. "Side projects and open source". */
  description: string
  /** How likely each site is to be used in this workspace, e.g. github.com → 0.8. */
  sites: SiteMap
}

/** A workspace's probability for a given site; result of cross-workspace lookups. */
export interface SiteMatch {
  workspaceId: WorkspaceId
  probability: number
}

/** Concrete placement of an open tab in a workspace. */
export interface TabAssignment {
  tabId: TabId
  workspaceId: WorkspaceId
}

export interface CreateWorkspaceInput {
  name: string
  description: string
  /** Optional caller-supplied id; otherwise the implementation generates one. */
  id?: WorkspaceId
  /** Optional initial site probabilities; defaults to empty. */
  sites?: SiteMap
}

/** A tab belonging to a workspace, saved while another workspace is open. */
export interface WorkspaceTab {
  id: TabId
  url: string
  title: string
  favicon?: string
}

/** The open tabs of one workspace: exactly what becomes current on a switch to it. */
export interface WorkspaceTabSet {
  tabs: WorkspaceTab[]
  activeTabId: TabId | null
}

/**
 * How a workspace switch changes the open-tab array. Same clear-and-replace
 * invariant as Memory's switch plan: every current tab is closed and the
 * resulting array is exactly the target workspace's `tabs`, in order.
 */
export interface WorkspaceTabSwitch extends WorkspaceTabSet {
  closeTabIds: TabId[]
}

export type Unsubscribe = () => void
