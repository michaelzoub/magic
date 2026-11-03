import { useCallback, useEffect, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { WorkspaceSwitchboard } from '../../../core/workspaces/switchboard'
import type { WorkspaceTabSet, WorkspaceTabSwitch } from '../../../core/workspaces/types'
import type { WorkspaceRecord } from '@shared/workspaces'
import { workspacePersistence as persistence } from './workspace-persistence'
import { Briefcase, GradCap, Layers, User } from '@/components/icons'

type IconComponent = (p: SVGProps<SVGSVGElement>) => ReactNode

const ICONS: Record<string, IconComponent> = {
  user: User,
  briefcase: Briefcase,
  'graduation-cap': GradCap,
  layers: Layers
}
const iconFor = (key: string): IconComponent => ICONS[key] ?? Layers

export type Workspace = {
  id: string
  name: string
  description: string
  /** Persisted icon key; `Icon` is its rendered component. */
  icon: string
  Icon: IconComponent
  tabs?: WorkspaceTabSet['tabs']
  activeTabId?: string | null
}

export type { WorkspaceTabSet, WorkspaceTabSwitch }

// Seed used on first run only; afterwards the local database is the source.
const seed: Workspace[] = [
  { id: 'personal', name: 'Personal', description: 'Personal browsing', icon: 'user', Icon: User },
  { id: 'work', name: 'Work', description: 'Work projects and tools', icon: 'briefcase', Icon: Briefcase },
  { id: 'school', name: 'School', description: 'Coursework and research', icon: 'graduation-cap', Icon: GradCap }
]

const toRecord = (w: Workspace, listed: boolean) => ({
  id: w.id,
  name: w.name,
  description: w.description,
  icon: w.icon,
  listed,
  lastSwitchedAt: null as number | null
})

const fromRecord = (r: WorkspaceRecord, tabSet?: WorkspaceTabSet): Workspace => ({
  id: r.id,
  name: r.name,
  description: r.description,
  icon: r.icon,
  Icon: iconFor(r.icon),
  ...(tabSet ? { tabs: tabSet.tabs, activeTabId: tabSet.activeTabId } : {})
})

/** Persistence is best-effort: a failed write never breaks a switch. */
const save = (write: () => Promise<void>) => {
  void write().catch(() => {})
}

/**
 * Workspace state shared by the menu and the sidebar list. All switching —
 * menu picks, creation, agent/memory focus modes — passes through the
 * WorkspaceSwitchboard, which guarantees the switched-to workspace is in
 * the listed (sidebar) array and active, and hands back the plan that sets
 * that workspace's respective tabs as the current open tabs. Callers must
 * enact the returned plan (see `applySwitch` in App); never set the active
 * workspace directly.
 *
 * Every path also persists through the SQLite layer: selecting a workspace
 * upserts it, creating one saves it (with its description), and every
 * switch records a before → after row plus the outgoing workspace's tabs.
 * On launch the board is rehydrated from the database (`ready` flips true;
 * App then restores the active workspace's saved tabs once).
 */
export function useWorkspaces() {
  const [board, setBoard] = useState(() => new WorkspaceSwitchboard<Workspace>(seed))
  const [ready, setReady] = useState(false)
  const [, setVersion] = useState(0)
  useEffect(() => board.subscribe(() => setVersion((v) => v + 1)), [board])

  useEffect(() => {
    let live = true
    persistence
      .load()
      .then((snap) => {
        if (!live) return
        if (!snap) {
          // First run: persist the seed so later selections/switches have rows to touch.
          for (const w of seed) save(() => persistence.upsertWorkspace(toRecord(w, false)))
        } else if (snap.workspaces.length > 0) {
          const restored = new WorkspaceSwitchboard<Workspace>(
            snap.workspaces.map((r) => fromRecord(r, snap.tabSets[r.id]))
          )
          restored.hydrate(snap.listedIds, snap.activeWorkspaceId)
          setBoard(restored)
        }
      })
      .catch(() => {})
      .finally(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [])

  /** Persist a switch: upsert the target first (FK target for the switch row), then record before → after. */
  const persistSwitch = useCallback((from: string | null, target: Workspace, current: WorkspaceTabSet) => {
    save(async () => {
      await persistence.upsertWorkspace(toRecord(target, true))
      await persistence.recordSwitch({
        fromWorkspaceId: from,
        toWorkspaceId: target.id,
        switchedAt: Date.now(),
        ...(from ? { outgoingTabSet: current } : {})
      })
    })
  }, [])

  /** Switch plan for `id`, or null when it is already active (tabs already current). */
  const select = useCallback(
    (id: string, current: WorkspaceTabSet): WorkspaceTabSwitch | null => {
      if (id === board.activeId) return null
      const from = board.activeId
      const { workspace, replaceTabs } = board.switchTo(id, current)
      persistSwitch(from, workspace, current)
      return replaceTabs
    },
    [board, persistSwitch]
  )

  /** Returns an error message (and no plan), or null plus the new workspace's switch plan. */
  const create = useCallback(
    (raw: string, description: string, current: WorkspaceTabSet): { error: string | null; plan: WorkspaceTabSwitch | null } => {
      try {
        const from = board.activeId
        const workspace: Workspace = { id: crypto.randomUUID(), name: raw.trim(), description: description.trim(), icon: 'layers', Icon: Layers }
        const { replaceTabs } = board.addAndSwitch(workspace, current)
        persistSwitch(from, workspace, current)
        return { error: null, plan: replaceTabs }
      } catch (e) {
        if (!(e instanceof Error)) return { error: 'Could not create workspace', plan: null }
        if (e.message.includes('name is required')) return { error: 'Name is required', plan: null }
        if (e.message.includes('already exists')) return { error: `“${raw.trim()}” already exists`, plan: null }
        return { error: e.message, plan: null }
      }
    },
    [board, persistSwitch]
  )

  /** Switch to a possibly-unregistered workspace (e.g. a Memory focus mode), carrying its tabs. */
  const ensureAndSwitch = useCallback(
    (w: { id: string; name: string; description?: string; tabs?: WorkspaceTabSet['tabs']; activeTabId?: string | null }, current: WorkspaceTabSet) => {
      const from = board.activeId
      const result = board.ensureAndSwitch({ description: '', icon: 'layers', Icon: Layers, ...w }, current)
      persistSwitch(from, result.workspace, current)
      return result.replaceTabs
    },
    [board, persistSwitch]
  )

  /** Saved open tabs of a workspace (empty until seeded or visited); used to restore on launch. */
  const getTabSet = useCallback(
    (id: string | null): WorkspaceTabSet => (id ? board.getTabSet(id) : { tabs: [], activeTabId: null }),
    [board]
  )

  return { all: board.workspaces, list: board.listedWorkspaces, activeId: board.activeId, ready, getTabSet, select, create, ensureAndSwitch }
}

export type UseWorkspaces = ReturnType<typeof useWorkspaces>
