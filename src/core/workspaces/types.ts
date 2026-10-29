/**
 * Core workspace data models. Pure data — no Electron, Chromium, React, or
 * agent-framework dependencies may be imported anywhere in `core/workspaces`.
 */

export type WorkspaceId = string
export type TabId = string
/** Normalized site key (e.g. registrable domain `github.com`). */
export type SiteKey = string

export type WorkspaceStatus = 'active' | 'background'

export interface Workspace {
  id: WorkspaceId
  name: string
  status: WorkspaceStatus
}

/** Affinity of a site toward a workspace. Independent of real tab placement. */
export interface WorkspaceSite {
  workspaceId: WorkspaceId
  /** 0–1 */
  usageProbability: number
}

export type SiteWorkspaceMap = Map<SiteKey, WorkspaceSite[]>

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
}

export type Unsubscribe = () => void
