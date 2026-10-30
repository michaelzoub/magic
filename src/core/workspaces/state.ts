import type { TabAssignment, Workspace, WorkspaceId } from './types'

/**
 * Canonical browser state. Single source of truth for workspaces: which
 * exist, which is active, where each tab lives, and per-workspace site
 * probabilities (stored on each workspace's `sites` map).
 *
 * Mutate only through BrowserController / BrowserStore so invariants hold.
 */
export interface BrowserState {
  workspaces: Workspace[]
  /** The one active workspace; null only when no workspaces exist. */
  activeWorkspaceId: WorkspaceId | null
  assignments: TabAssignment[]
}

/** Empty state, or `init` normalized so invariants hold (active + assignments valid). */
export function createBrowserState(init: Partial<BrowserState> = {}): BrowserState {
  const workspaces = init.workspaces ?? []
  const ids = new Set(workspaces.map((w) => w.id))
  const active = init.activeWorkspaceId ?? null
  return {
    workspaces,
    activeWorkspaceId: active !== null && ids.has(active) ? active : (workspaces[0]?.id ?? null),
    assignments: (init.assignments ?? []).filter((a) => ids.has(a.workspaceId))
  }
}
