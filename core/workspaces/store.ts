import { BrowserController } from './controller'
import { createBrowserState, type BrowserState } from './state'
import type {
  CreateWorkspaceInput,
  SiteKey,
  SiteMatch,
  TabAssignment,
  TabId,
  Unsubscribe,
  Workspace,
  WorkspaceId
} from './types'

/**
 * Persistence port. Implementations live outside core (file, IndexedDB…).
 * Must round-trip the state as-is, preserving each workspace's `sites` map.
 */
export interface BrowserStorage {
  load(): BrowserState | null | Promise<BrowserState | null>
  save(state: BrowserState): void | Promise<void>
}

export type BrowserListener = (state: BrowserState) => void

/**
 * Owns the canonical BrowserState. Reads go through getState / queries,
 * writes go through controller-enforced mutations; every mutation notifies
 * subscribers and persists. Persistence is best-effort: a storage failure
 * never breaks the mutation.
 */
export class BrowserStore {
  private readonly state: BrowserState
  private readonly controller: BrowserController
  private readonly storage?: BrowserStorage
  private readonly listeners = new Set<BrowserListener>()

  constructor(options: { initial?: BrowserState; storage?: BrowserStorage } = {}) {
    this.state = options.initial ?? createBrowserState()
    this.controller = new BrowserController(this.state)
    this.storage = options.storage
  }

  /** Rehydrate from storage, falling back when nothing was saved. */
  static async load(storage: BrowserStorage, fallback?: BrowserState): Promise<BrowserStore> {
    const initial = (await storage.load()) ?? fallback ?? createBrowserState()
    return new BrowserStore({ initial, storage })
  }

  getState(): BrowserState {
    return this.state
  }

  subscribe(listener: BrowserListener): Unsubscribe {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  list(): Workspace[] {
    return this.controller.list()
  }

  get(id: WorkspaceId): Workspace | null {
    return this.controller.get(id)
  }

  getActive(): Workspace | null {
    return this.controller.getActive()
  }

  getWorkspaceForTab(tabId: TabId): WorkspaceId | null {
    return this.controller.getWorkspaceForTab(tabId)
  }

  listTabs(workspaceId: WorkspaceId): TabId[] {
    return this.controller.listTabs(workspaceId)
  }

  getSite(workspaceId: WorkspaceId, site: SiteKey): number {
    return this.controller.getSite(workspaceId, site)
  }

  matchSite(site: SiteKey): SiteMatch[] {
    return this.controller.matchSite(site)
  }

  create(input: CreateWorkspaceInput): Workspace {
    return this.commit(() => this.controller.create(input))
  }

  switchTo(id: WorkspaceId): Workspace {
    return this.commit(() => this.controller.switchTo(id))
  }

  assign(tabId: TabId, workspaceId: WorkspaceId): TabAssignment {
    return this.commit(() => this.controller.assign(tabId, workspaceId))
  }

  unassign(tabId: TabId): void {
    this.commit(() => this.controller.unassign(tabId))
  }

  setSite(workspaceId: WorkspaceId, site: SiteKey, probability: number): void {
    this.commit(() => this.controller.setSite(workspaceId, site, probability))
  }

  removeSite(workspaceId: WorkspaceId, site: SiteKey): void {
    this.commit(() => this.controller.removeSite(workspaceId, site))
  }

  private commit<T>(mutate: () => T): T {
    const result = mutate()
    for (const listener of this.listeners) listener(this.state)
    this.persist()
    return result
  }

  private persist(): void {
    if (!this.storage) return
    try {
      const result = this.storage.save(structuredClone(this.state))
      if (result instanceof Promise) result.catch(() => {})
    } catch {
      // persistence is best-effort
    }
  }
}
