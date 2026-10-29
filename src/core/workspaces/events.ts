import type {
  ChangeSource,
  SiteKey,
  TabId,
  Workspace,
  WorkspaceId,
  WorkspaceSite
} from './types'

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

export type SiteAffinityEvent = {
  type: 'affinity.changed'
  site: SiteKey
  entries: readonly WorkspaceSite[]
  source: ChangeSource
}

export type Listener<E> = (event: E) => void
