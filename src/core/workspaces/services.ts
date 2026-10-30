/**
 * Service contracts consumed by the app shell. Tab assignment and site
 * probabilities are deliberately separate: probability is a preference,
 * assignment is where a tab actually lives. Neither mutates the other.
 */
import type {
  Listener,
  SiteProbabilityEvent,
  TabAssignmentEvent,
  WorkspaceEvent
} from './events'
import type {
  ChangeSource,
  CreateWorkspaceInput,
  SiteKey,
  SiteMap,
  SiteMatch,
  TabAssignment,
  TabId,
  Unsubscribe,
  Workspace,
  WorkspaceId
} from './types'

export interface WorkspaceService {
  /** Rejects if another workspace already has this name (trimmed, case-insensitive). */
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

/** Reads and writes the `sites` map on each workspace. */
export interface SiteProbabilityService {
  /** Probability of `site` in one workspace; 0 if absent. Direct map lookup. */
  get(workspaceId: WorkspaceId, site: SiteKey): Promise<number>
  /** Probability must be within 0–1. */
  set(workspaceId: WorkspaceId, site: SiteKey, probability: number, source?: ChangeSource): Promise<void>
  remove(workspaceId: WorkspaceId, site: SiteKey, source?: ChangeSource): Promise<void>
  /** Every workspace that knows `site`, highest probability first. */
  match(site: SiteKey): Promise<SiteMatch[]>
  subscribe(listener: Listener<SiteProbabilityEvent>): Unsubscribe
}

/** Maps a raw URL to the key used for site lookups. */
export interface SiteKeyResolver {
  resolve(url: string): SiteKey | null
}

/**
 * Extension point for external producers (heuristics, agents, sync) that
 * propose probability updates. Implementations read via the services and
 * write back through them using a `ChangeSource` identifying themselves.
 */
export interface SiteProbabilityProvider {
  readonly id: string
  /** Proposed full site map for a workspace, or null for no opinion. */
  computeSites(workspace: Workspace): Promise<SiteMap | null>
}
