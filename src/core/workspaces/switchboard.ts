import type { TabId, Unsubscribe, WorkspaceId, WorkspaceTab, WorkspaceTabSet, WorkspaceTabSwitch } from './types'

/** Minimal shape the switchboard needs; UI layers may attach more (icons…). */
export interface SwitchableWorkspace {
  id: WorkspaceId
  name: string
  /** Tabs that become the open tabs when switching to this workspace. */
  tabs?: readonly WorkspaceTab[]
  activeTabId?: TabId | null
}

/** Result of a switch: the workspace, plus the tab plan the caller must enact. */
export interface WorkspaceSwitchResult<T> {
  workspace: T
  /** Clear the current tabs and make the target workspace's tabs current. */
  replaceTabs: WorkspaceTabSwitch
}

const normalizeTabSet = (tabs: readonly WorkspaceTab[] = [], activeTabId?: TabId | null): WorkspaceTabSet => {
  const copy = tabs.map((t) => ({ ...t }))
  return {
    tabs: copy,
    activeTabId: activeTabId && copy.some((t) => t.id === activeTabId) ? activeTabId : (copy[0]?.id ?? null)
  }
}

const key = (name: string) => name.trim().toLowerCase()

/**
 * Intermediary for EVERY workspace switch. No code path may activate a
 * workspace except through {@link WorkspaceSwitchboard.switchTo} (creation
 * and agent/memory-driven switches funnel through it too).
 *
 * Invariants it enforces: switching to a workspace adds it — once, in
 * first-switch order — to `listedIds`, the state array behind the sidebar
 * section under Memory, and makes it the active workspace. A switch can
 * therefore never land on a workspace that the sidebar doesn't show.
 *
 * A switch also sets the target workspace's respective tabs as the current
 * open tabs: the outgoing workspace's live tabs are saved under its id, and
 * the returned `replaceTabs` plan closes every current tab and opens exactly
 * the target's saved tabs (never a merge). Callers must enact that plan —
 * activating the workspace without swapping the tab array is a bug.
 */
export class WorkspaceSwitchboard<T extends SwitchableWorkspace = SwitchableWorkspace> {
  private readonly all: T[] = []
  private readonly listed: WorkspaceId[] = []
  private readonly tabSets = new Map<WorkspaceId, WorkspaceTabSet>()
  private active: WorkspaceId | null = null
  private readonly listeners = new Set<() => void>()

  constructor(initial: readonly T[] = []) {
    for (const w of initial) this.register(w)
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Restore persisted listing/active state (e.g. from the local database on
   * launch) without recording a switch. Unknown ids are dropped; the active
   * workspace, when valid, is also listed so the sidebar invariant holds.
   */
  hydrate(listedIds: readonly WorkspaceId[], activeId: WorkspaceId | null): void {
    const valid = (id: WorkspaceId | null): id is WorkspaceId => id !== null && this.get(id) !== null
    this.listed.length = 0
    for (const id of listedIds) if (valid(id) && !this.listed.includes(id)) this.listed.push(id)
    this.active = valid(activeId) ? activeId : null
    if (this.active !== null && !this.listed.includes(this.active)) this.listed.push(this.active)
    this.emit()
  }

  /** Every known workspace, in registration order. */
  get workspaces(): T[] {
    return [...this.all]
  }

  /** Ids in the sidebar's existing-workspaces section, in first-switch order. */
  get listedIds(): WorkspaceId[] {
    return [...this.listed]
  }

  /** Workspaces in the sidebar section, same order as `listedIds`. */
  get listedWorkspaces(): T[] {
    return this.listed.map((id) => this.get(id)!)
  }

  get activeId(): WorkspaceId | null {
    return this.active
  }

  get(id: WorkspaceId): T | null {
    return this.all.find((w) => w.id === id) ?? null
  }

  getActive(): T | null {
    return this.active === null ? null : this.get(this.active)
  }

  /** The saved open tabs of a workspace; empty until it is seeded or visited. */
  getTabSet(id: WorkspaceId): WorkspaceTabSet {
    if (!this.get(id)) throw new Error(`No workspace with id ${id}`)
    const set = this.tabSets.get(id) ?? { tabs: [], activeTabId: null }
    return { tabs: set.tabs.map((t) => ({ ...t })), activeTabId: set.activeTabId }
  }

  /** Replace a workspace's saved open tabs (e.g. a focus mode's After tabs). */
  setTabSet(id: WorkspaceId, set: WorkspaceTabSet): void {
    if (!this.get(id)) throw new Error(`No workspace with id ${id}`)
    this.tabSets.set(id, normalizeTabSet(set.tabs, set.activeTabId))
  }

  /**
   * The one gate for switching. Adds the workspace to the listed array if
   * absent, then activates it. Throws for unknown ids — register first.
   *
   * `current` is the live open-tab array; it is saved as the outgoing
   * workspace's tab set before the target's set is handed back in
   * `replaceTabs`, so switching away and back restores each workspace's
   * respective tabs exactly. A failed switch saves and changes nothing.
   */
  switchTo(id: WorkspaceId, current?: WorkspaceTabSet): WorkspaceSwitchResult<T> {
    const workspace = this.get(id)
    if (!workspace) throw new Error(`No workspace with id ${id}`)
    if (current && this.active !== null) this.tabSets.set(this.active, normalizeTabSet(current.tabs, current.activeTabId))
    if (!this.listed.includes(id)) this.listed.push(id)
    this.active = id
    this.emit()
    const target = this.tabSets.get(id) ?? { tabs: [], activeTabId: null }
    return {
      workspace,
      replaceTabs: {
        closeTabIds: (current?.tabs ?? []).map((t) => t.id),
        tabs: target.tabs.map((t) => ({ ...t })),
        activeTabId: target.activeTabId
      }
    }
  }

  /** Create path: register a new workspace, then switch through the gate. */
  addAndSwitch(workspace: T, current?: WorkspaceTabSet): WorkspaceSwitchResult<T> {
    this.register(workspace)
    return this.switchTo(workspace.id, current)
  }

  /**
   * Agent/memory path: switch to a workspace that may not be registered
   * yet (e.g. a focus mode from a checkpoint), registering it on the fly.
   * Still passes through the gate, so it is listed and activated. When the
   * workspace carries `tabs`, they become its saved tab set.
   */
  ensureAndSwitch(workspace: T, current?: WorkspaceTabSet): WorkspaceSwitchResult<T> {
    if (!this.get(workspace.id)) this.register(workspace)
    else if (workspace.tabs) this.setTabSet(workspace.id, { tabs: [...workspace.tabs], activeTabId: workspace.activeTabId ?? null })
    return this.switchTo(workspace.id, current)
  }

  private register(workspace: T): void {
    const name = workspace.name.trim()
    if (!workspace.id) throw new Error('Workspace id is required')
    if (!name) throw new Error('Workspace name is required')
    if (this.get(workspace.id)) throw new Error(`Workspace id "${workspace.id}" already exists`)
    if (this.all.some((w) => key(w.name) === key(name))) {
      throw new Error(`Workspace "${name}" already exists`)
    }
    this.all.push(workspace)
    this.tabSets.set(workspace.id, normalizeTabSet(workspace.tabs ?? [], workspace.activeTabId))
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
