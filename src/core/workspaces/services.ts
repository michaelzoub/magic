/**
 * Service contracts consumed by the app shell. Tab assignment and site
 * affinity are deliberately separate: affinity is a probabilistic preference,
 * assignment is where a tab actually lives. Neither mutates the other.
 */
import type {
  Listener,
  SiteAffinityEvent,
  TabAssignmentEvent,
  WorkspaceEvent
} from './events'
import type {
  ChangeSource,
  CreateWorkspaceInput,
  SiteKey,
  SiteWorkspaceMap,
  TabAssignment,
  TabId,
  Unsubscribe,
  Workspace,
  WorkspaceId,
  WorkspaceSite
} from './types'

export interface WorkspaceService {
  create(input: CreateWorkspaceInput, source?: ChangeSource): Promise<Workspace>
  list(): Promise<Workspace[]>
  get(id: WorkspaceId): Promise<Workspace | null>
  getActive(): Promise<Workspace | null>
  /** Mark `id` active and all others background. */
  switchTo(id: WorkspaceId, source?: ChangeSource): Promise<Workspace>
  subscribe(listener: Listener<WorkspaceEvent>): Unsubscribe
}

export interface TabAssignmentService {
  assign(tabId: TabId, workspaceId: WorkspaceId, source?: ChangeSource): Promise<TabAssignment>
  unassign(tabId: TabId, source?: ChangeSource): Promise<void>
  getWorkspaceForTab(tabId: TabId): Promise<WorkspaceId | null>
  listTabs(workspaceId: WorkspaceId): Promise<TabId[]>
  subscribe(listener: Listener<TabAssignmentEvent>): Unsubscribe
}

export interface SiteAffinityService {
  getMap(): Promise<SiteWorkspaceMap>
  getAffinities(site: SiteKey): Promise<WorkspaceSite[]>
  /** Highest-probability workspace for a site, if any. */
  getTopWorkspace(site: SiteKey): Promise<WorkspaceSite | null>
  /** Replace all entries for a site. Probabilities must be within 0–1. */
  setAffinities(
    site: SiteKey,
    entries: readonly WorkspaceSite[],
    source?: ChangeSource
  ): Promise<void>
  clear(site: SiteKey, source?: ChangeSource): Promise<void>
  subscribe(listener: Listener<SiteAffinityEvent>): Unsubscribe
}

/** Maps a raw URL to the key used for affinity lookups. */
export interface SiteKeyResolver {
  resolve(url: string): SiteKey | null
}

/**
 * Extension point for external producers (heuristics, agents, sync) that
 * propose affinity updates. Implementations read via the services and write
 * back through them using a `ChangeSource` identifying themselves.
 */
export interface SiteAffinityProvider {
  readonly id: string
  computeAffinities(
    site: SiteKey,
    context: { workspaces: readonly Workspace[]; current: readonly WorkspaceSite[] }
  ): Promise<WorkspaceSite[] | null>
}
