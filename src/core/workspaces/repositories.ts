/**
 * Persistence ports. Implementations (in-memory, file, IndexedDB, remote…)
 * live outside `core` and are injected into services. All methods are async so
 * any storage backend can satisfy them.
 */
import type {
  SiteKey,
  SiteWorkspaceMap,
  TabAssignment,
  TabId,
  Workspace,
  WorkspaceId,
  WorkspaceSite
} from './types'

export interface WorkspaceRepository {
  getAll(): Promise<Workspace[]>
  getById(id: WorkspaceId): Promise<Workspace | null>
  save(workspace: Workspace): Promise<void>
  saveMany(workspaces: readonly Workspace[]): Promise<void>
  remove(id: WorkspaceId): Promise<void>
}

export interface TabAssignmentRepository {
  getAll(): Promise<TabAssignment[]>
  getByTab(tabId: TabId): Promise<TabAssignment | null>
  getByWorkspace(workspaceId: WorkspaceId): Promise<TabAssignment[]>
  save(assignment: TabAssignment): Promise<void>
  remove(tabId: TabId): Promise<void>
}

export interface SiteAffinityRepository {
  getAll(): Promise<SiteWorkspaceMap>
  getBySite(site: SiteKey): Promise<WorkspaceSite[]>
  save(site: SiteKey, entries: readonly WorkspaceSite[]): Promise<void>
  remove(site: SiteKey): Promise<void>
  /** Drop every affinity entry pointing at a workspace (e.g. on deletion). */
  removeWorkspace(workspaceId: WorkspaceId): Promise<void>
}
