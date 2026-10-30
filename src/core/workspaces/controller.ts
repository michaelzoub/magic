import type { BrowserState } from './state'
import type {
  CreateWorkspaceInput,
  SiteKey,
  SiteMatch,
  TabAssignment,
  TabId,
  Workspace,
  WorkspaceId
} from './types'

/**
 * All workspace mutations in one place. Enforces the invariants:
 * - one active workspace (the first workspace becomes active)
 * - workspace names are unique (trimmed, case-insensitive)
 * - every referenced workspace id exists; every assignment points at one
 * - site probabilities stay within 0–1
 *
 * Probability is a preference, assignment is where a tab actually lives;
 * neither mutates the other. Pure in-memory logic — no listeners, no
 * persistence (see BrowserStore).
 */
export class BrowserController {
  constructor(private readonly state: BrowserState) {}

  list(): Workspace[] {
    return [...this.state.workspaces]
  }

  get(id: WorkspaceId): Workspace | null {
    return this.state.workspaces.find((w) => w.id === id) ?? null
  }

  getActive(): Workspace | null {
    const id = this.state.activeWorkspaceId
    return id === null ? null : this.get(id)
  }

  getWorkspaceForTab(tabId: TabId): WorkspaceId | null {
    return this.state.assignments.find((a) => a.tabId === tabId)?.workspaceId ?? null
  }

  listTabs(workspaceId: WorkspaceId): TabId[] {
    this.requireWorkspace(workspaceId)
    return this.state.assignments.filter((a) => a.workspaceId === workspaceId).map((a) => a.tabId)
  }

  /** Probability of `site` in one workspace; 0 if absent. */
  getSite(workspaceId: WorkspaceId, site: SiteKey): number {
    return this.requireWorkspace(workspaceId).sites.get(site) ?? 0
  }

  /** Every workspace that knows `site`, highest probability first. */
  matchSite(site: SiteKey): SiteMatch[] {
    return this.state.workspaces
      .filter((w) => w.sites.has(site))
      .map((w) => ({ workspaceId: w.id, probability: w.sites.get(site)! }))
      .sort((a, b) => b.probability - a.probability)
  }

  /** First workspace becomes active; later ones leave the active untouched. */
  create(input: CreateWorkspaceInput): Workspace {
    const name = input.name.trim()
    if (!name) throw new Error('Workspace name is required')
    if (this.state.workspaces.some((w) => w.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new Error(`Workspace "${name}" already exists`)
    }
    const id = input.id ?? crypto.randomUUID()
    if (!id) throw new Error('Workspace id is required')
    if (this.get(id)) throw new Error(`Workspace id "${id}" already exists`)
    const workspace: Workspace = { id, name, sites: new Map(input.sites ?? []) }
    this.state.workspaces.push(workspace)
    if (this.state.activeWorkspaceId === null) this.state.activeWorkspaceId = id
    return workspace
  }

  switchTo(id: WorkspaceId): Workspace {
    const workspace = this.requireWorkspace(id)
    this.state.activeWorkspaceId = id
    return workspace
  }

  /** Assigns (or moves) a tab to a workspace. */
  assign(tabId: TabId, workspaceId: WorkspaceId): TabAssignment {
    if (!tabId) throw new Error('Tab id is required')
    this.requireWorkspace(workspaceId)
    const existing = this.state.assignments.find((a) => a.tabId === tabId)
    if (existing) {
      existing.workspaceId = workspaceId
      return existing
    }
    const assignment: TabAssignment = { tabId, workspaceId }
    this.state.assignments.push(assignment)
    return assignment
  }

  /** No-op when the tab has no assignment. */
  unassign(tabId: TabId): void {
    const i = this.state.assignments.findIndex((a) => a.tabId === tabId)
    if (i >= 0) this.state.assignments.splice(i, 1)
  }

  setSite(workspaceId: WorkspaceId, site: SiteKey, probability: number): void {
    if (!(probability >= 0 && probability <= 1)) throw new Error('Probability must be within 0–1')
    this.requireWorkspace(workspaceId).sites.set(site, probability)
  }

  removeSite(workspaceId: WorkspaceId, site: SiteKey): void {
    this.requireWorkspace(workspaceId).sites.delete(site)
  }

  private requireWorkspace(id: WorkspaceId): Workspace {
    const workspace = this.get(id)
    if (!workspace) throw new Error(`No workspace with id ${id}`)
    return workspace
  }
}
