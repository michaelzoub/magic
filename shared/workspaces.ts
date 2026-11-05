/**
 * Workspace persistence contract (SQLite in the main process).
 *
 * The renderer never touches the database directly: it talks to this
 * interface over IPC (see preload), with an in-memory fallback for plain
 * browser development. Every workspace selection/creation funnels through
 * `upsertWorkspace`, and every workspace switch through `recordSwitch`, so
 * the database always knows the current workspaces plus the full
 * before → after switch history.
 */

export interface PersistedWorkspaceTab {
  id: string
  url: string
  title: string
  favicon?: string
}

export interface PersistedTabSet {
  tabs: PersistedWorkspaceTab[]
  activeTabId: string | null
}

export interface WorkspaceRecord {
  id: string
  name: string
  /** What the user wants to get done in this workspace. */
  goal: string
  /** Icon key understood by the renderer (`user`, `briefcase`, `layers`). */
  icon: string
  /** Shown in the sidebar's existing-workspaces section. */
  listed: boolean
  /** Stable ordering (first persisted / first switched first). */
  sortOrder: number
  createdAt: number
  updatedAt: number
  lastSwitchedAt: number | null
}

/** One row of switch history: the workspace left and the one entered. */
export interface WorkspaceSwitchRecord {
  id: number
  /** Workspace active before the switch; null for the first-ever switch. */
  fromWorkspaceId: string | null
  toWorkspaceId: string
  switchedAt: number
}

export interface WorkspaceSnapshot {
  workspaces: WorkspaceRecord[]
  /** Ids in sidebar order (first-switch order), mirroring `listed`. */
  listedIds: string[]
  activeWorkspaceId: string | null
  /** Saved open tabs per workspace id, restored when switching back. */
  tabSets: Record<string, PersistedTabSet>
  /** Most recent switches, newest first. */
  switches: WorkspaceSwitchRecord[]
}

export interface RecordSwitchInput {
  fromWorkspaceId: string | null
  toWorkspaceId: string
  switchedAt: number
  /** Live tabs of the outgoing workspace, saved under its id. */
  outgoingTabSet?: PersistedTabSet
}

export interface WorkspacePersistence {
  /** Full persisted state, or null when nothing was ever saved. */
  load(): Promise<WorkspaceSnapshot | null>
  /** Insert or update a workspace (selection touches it, creation adds it). */
  upsertWorkspace(workspace: Omit<WorkspaceRecord, 'sortOrder' | 'createdAt' | 'updatedAt'> & Partial<Pick<WorkspaceRecord, 'sortOrder' | 'createdAt' | 'updatedAt'>>): Promise<void>
  /** Delete a workspace, its saved tabs, and (if it was active) the active id. */
  deleteWorkspace(workspaceId: string): Promise<void>
  /** Append a before → after switch and make the target active + listed. */
  recordSwitch(input: RecordSwitchInput): Promise<void>
  saveTabSet(workspaceId: string, tabSet: PersistedTabSet): Promise<void>
  /** Quit the active workspace: clear the stored active id so no workspace is set on next launch either. */
  clearActiveWorkspace(): Promise<void>
  listSwitches(limit?: number): Promise<WorkspaceSwitchRecord[]>
}

export const WORKSPACE_IPC = {
  load: 'workspaces:load',
  upsert: 'workspaces:upsert',
  delete: 'workspaces:delete',
  recordSwitch: 'workspaces:record-switch',
  saveTabSet: 'workspaces:save-tab-set',
  clearActive: 'workspaces:clear-active',
  listSwitches: 'workspaces:list-switches'
} as const
