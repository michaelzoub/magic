/**
 * Core workspace data models. Pure data — no Electron, Chromium, React, or
 * agent-framework dependencies may be imported anywhere in `core/workspaces`.
 */

export type WorkspaceId = string
export type TabId = string
/** Normalized site key (e.g. registrable domain `github.com`). */
export type SiteKey = string

export type WorkspaceStatus = 'active' | 'background'

/** Site → usage probability (0–1) within one workspace. */
export type SiteMap = Map<SiteKey, number>

export interface Workspace {
  id: WorkspaceId
  /** Unique across workspaces (compared trimmed, case-insensitive). */
  name: string
  status: WorkspaceStatus
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

/** Who caused a change — lets agent-driven updates be audited or filtered. */
export type ChangeSource =
  | { kind: 'user' }
  | { kind: 'system' }
  | { kind: 'agent'; agentId: string }

export interface CreateWorkspaceInput {
  name: string
  /** Optional caller-supplied id; otherwise the implementation generates one. */
  id?: WorkspaceId
  /** Optional initial site probabilities; defaults to empty. */
  sites?: SiteMap
}

export type Unsubscribe = () => void
