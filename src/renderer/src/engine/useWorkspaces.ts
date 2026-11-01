import { useCallback, useEffect, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { WorkspaceSwitchboard } from '../../../core/workspaces/switchboard'
import type { WorkspaceTabSet, WorkspaceTabSwitch } from '../../../core/workspaces/types'
import { Briefcase, GradCap, Layers, User } from '@/components/icons'

export type Workspace = {
  id: string
  name: string
  Icon: (p: SVGProps<SVGSVGElement>) => ReactNode
  tabs?: WorkspaceTabSet['tabs']
  activeTabId?: string | null
}

export type { WorkspaceTabSet, WorkspaceTabSwitch }

// Mock data; swap for a store once workspaces are real.
const seed: Workspace[] = [
  { id: 'personal', name: 'Personal', Icon: User },
  { id: 'work', name: 'Work', Icon: Briefcase },
  { id: 'school', name: 'School', Icon: GradCap }
]

/**
 * Workspace state shared by the menu and the sidebar list. All switching —
 * menu picks, creation, agent/memory focus modes — passes through the
 * WorkspaceSwitchboard, which guarantees the switched-to workspace is in
 * the listed (sidebar) array and active, and hands back the plan that sets
 * that workspace's respective tabs as the current open tabs. Callers must
 * enact the returned plan (see `applySwitch` in App); never set the active
 * workspace directly.
 */
export function useWorkspaces() {
  const [board] = useState(() => new WorkspaceSwitchboard<Workspace>(seed))
  const [, setVersion] = useState(0)
  useEffect(() => board.subscribe(() => setVersion((v) => v + 1)), [board])

  /** Switch plan for `id`, or null when it is already active (tabs already current). */
  const select = useCallback(
    (id: string, current: WorkspaceTabSet): WorkspaceTabSwitch | null =>
      id === board.activeId ? null : board.switchTo(id, current).replaceTabs,
    [board]
  )

  /** Returns an error message (and no plan), or null plus the new workspace's switch plan. */
  const create = useCallback(
    (raw: string, current: WorkspaceTabSet): { error: string | null; plan: WorkspaceTabSwitch | null } => {
      try {
        const { replaceTabs } = board.addAndSwitch({ id: crypto.randomUUID(), name: raw.trim(), Icon: Layers }, current)
        return { error: null, plan: replaceTabs }
      } catch (e) {
        if (!(e instanceof Error)) return { error: 'Could not create workspace', plan: null }
        if (e.message.includes('name is required')) return { error: 'Name is required', plan: null }
        if (e.message.includes('already exists')) return { error: `“${raw.trim()}” already exists`, plan: null }
        return { error: e.message, plan: null }
      }
    },
    [board]
  )

  /** Switch to a possibly-unregistered workspace (e.g. a Memory focus mode), carrying its tabs. */
  const ensureAndSwitch = useCallback(
    (w: { id: string; name: string; tabs?: WorkspaceTabSet['tabs']; activeTabId?: string | null }, current: WorkspaceTabSet) =>
      board.ensureAndSwitch({ ...w, Icon: Layers }, current).replaceTabs,
    [board]
  )

  return { all: board.workspaces, list: board.listedWorkspaces, activeId: board.activeId, select, create, ensureAndSwitch }
}

export type UseWorkspaces = ReturnType<typeof useWorkspaces>
