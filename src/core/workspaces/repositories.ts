/**
 * Persistence ports. Implementations (in-memory, file, IndexedDB, remote…)
 * live outside `core` and are injected into services. All methods are async so
 * any storage backend can satisfy them.
 *
 * Site probabilities are part of `Workspace` and persist with it.
 */
import type { TabAssignment, TabId, Workspace, WorkspaceId } from './types'

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
