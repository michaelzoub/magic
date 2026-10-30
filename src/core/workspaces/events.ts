import type { ChangeSource, SiteKey, TabId, Workspace, WorkspaceId } from './types'

export type WorkspaceEvent =
  | { type: 'workspace.created'; workspace: Workspace; source: ChangeSource }
  | { type: 'workspace.updated'; workspace: Workspace; source: ChangeSource }
  | { type: 'workspace.removed'; workspaceId: WorkspaceId; source: ChangeSource }
  | {
      type: 'workspace.switched'
      from: WorkspaceId | null
      to: WorkspaceId
      source: ChangeSource
    }

export type TabAssignmentEvent =
  | { type: 'tab.assigned'; tabId: TabId; workspaceId: WorkspaceId; source: ChangeSource }
  | { type: 'tab.unassigned'; tabId: TabId; source: ChangeSource }

/** One site's probability changed inside one workspace. `null` = site removed. */
export type SiteProbabilityEvent = {
  type: 'site.changed'
  workspaceId: WorkspaceId
  site: SiteKey
  probability: number | null
  source: ChangeSource
}

export type Listener<E> = (event: E) => void
