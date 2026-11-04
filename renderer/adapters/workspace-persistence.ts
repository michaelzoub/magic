import type {
  PersistedTabSet,
  WorkspacePersistence,
  WorkspaceRecord,
  WorkspaceSnapshot,
  WorkspaceSwitchRecord
} from '@shared/workspaces'

declare global {
  interface Window {
    workspaces?: WorkspacePersistence
  }
}

/** In-memory fallback for plain-browser UI work (no Electron preload). Same contract, nothing survives reload. */
function createMemoryPersistence(): WorkspacePersistence {
  const workspaces = new Map<string, WorkspaceRecord>()
  const tabSets: Record<string, PersistedTabSet> = {}
  const switches: WorkspaceSwitchRecord[] = []
  let activeWorkspaceId: string | null = null
  let nextSort = 0
  let nextSwitchId = 1

  return {
    async load(): Promise<WorkspaceSnapshot | null> {
      if (workspaces.size === 0) return null
      const all = [...workspaces.values()].sort((a, b) => a.sortOrder - b.sortOrder)
      return {
        workspaces: all,
        listedIds: all.filter((w) => w.listed).map((w) => w.id),
        activeWorkspaceId,
        tabSets: structuredClone(tabSets),
        switches: [...switches].reverse()
      }
    },
    async upsertWorkspace(input) {
      const existing = workspaces.get(input.id)
      const now = Date.now()
      workspaces.set(input.id, {
        id: input.id,
        name: input.name,
        goal: input.goal ?? '',
        icon: input.icon || 'layers',
        listed: input.listed,
        sortOrder: existing?.sortOrder ?? input.sortOrder ?? nextSort++,
        createdAt: existing?.createdAt ?? input.createdAt ?? now,
        updatedAt: now,
        lastSwitchedAt: input.lastSwitchedAt ?? existing?.lastSwitchedAt ?? null
      })
    },
    async deleteWorkspace(workspaceId) {
      if (!workspaces.delete(workspaceId)) throw new Error(`No workspace with id ${workspaceId}`)
      delete tabSets[workspaceId]
      if (activeWorkspaceId === workspaceId) activeWorkspaceId = null
    },
    async recordSwitch(input) {
      if (input.fromWorkspaceId === input.toWorkspaceId) return
      const target = workspaces.get(input.toWorkspaceId)
      if (!target) throw new Error(`No workspace with id ${input.toWorkspaceId}`)
      switches.push({ id: nextSwitchId++, fromWorkspaceId: input.fromWorkspaceId, toWorkspaceId: input.toWorkspaceId, switchedAt: input.switchedAt })
      target.listed = true
      target.lastSwitchedAt = input.switchedAt
      activeWorkspaceId = input.toWorkspaceId
      if (input.fromWorkspaceId && input.outgoingTabSet) tabSets[input.fromWorkspaceId] = structuredClone(input.outgoingTabSet)
    },
    async saveTabSet(workspaceId, tabSet) {
      if (!workspaces.has(workspaceId)) throw new Error(`No workspace with id ${workspaceId}`)
      tabSets[workspaceId] = structuredClone(tabSet)
    },
    async clearActiveWorkspace() {
      activeWorkspaceId = null
    },
    async listSwitches(limit = 100) {
      return [...switches].reverse().slice(0, limit)
    }
  }
}

/** SQLite-backed persistence inside the shell; in-memory fallback in a browser tab. */
export const workspacePersistence: WorkspacePersistence = window.workspaces ?? createMemoryPersistence()
