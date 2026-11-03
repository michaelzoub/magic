import { useEffect, useRef, useState } from 'react'
import { useBrowser } from '@/engine/useBrowser'
import { useMemory } from '@/engine/useMemory'
import { useWorkspaces } from '@/engine/useWorkspaces'
import type { CheckpointId, WorkspaceSwitchPlan } from '../../core/memory'
import { ImportLoginsDialog } from '@/components/ImportLoginsDialog'
import { MemoryDialog, type MemoryNavigateTarget } from '@/components/MemoryDialog'
import { RAIL, Sidebar } from '@/components/Sidebar'
import { TabStrip } from '@/components/TabStrip'
import { Toolbar } from '@/components/Toolbar'
import { Viewport } from '@/components/Viewport'

export function App() {
  const { tabs, activeTabId, activeTab, engine } = useBrowser()
  const id = activeTab?.id
  const [sidebar, setSidebar] = useState(RAIL)
  const [lastOpen, setLastOpen] = useState(208)
  const open = sidebar > RAIL
  const resize = (w: number) => (setSidebar(w), w > RAIL && setLastOpen(w))
  const memory = useMemory()
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const ws = useWorkspaces()
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)

  /**
   * Enact a workspace switch: the target workspace's tabs replace the open
   * tab array — never appended to. The engine keeps recently used
   * workspaces' pages alive in the background, so switching back to one
   * re-shows its live tabs instead of reloading the plan's URLs. `reset`
   * forces exactly the plan's tabs (Memory restores, launch).
   */
  const applySwitch = async (workspaceId: string, plan: WorkspaceSwitchPlan, reset = false) => {
    const active = plan.tabs.findIndex((t) => t.id === plan.activeTabId)
    await engine.switchWorkspace(workspaceId, plan.tabs, Math.max(active, 0), reset)
  }

  /** Live tabs as a workspace tab set, for saving under the outgoing workspace. */
  const currentTabSet = () => ({
    tabs: tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, favicon: t.favicon })),
    activeTabId
  })

  /**
   * Save a workspace transition in Memory as a Before → After checkpoint:
   * the outgoing workspace's live tabs are the Before, the target workspace
   * (with the tabs the switch plan is about to open) is the After. Without
   * this, switches were only written to the SQLite switch history and never
   * reached Memory — `memory.record` had no caller outside the seed.
   */
  const recordTransition = (
    fromId: string | null,
    to: { id: string; title: string },
    current: ReturnType<typeof currentTabSet>,
    plan: WorkspaceSwitchPlan
  ) => {
    const from = fromId ? ws.all.find((w) => w.id === fromId) : undefined
    if (!from || from.id === to.id) return
    memory.record({
      beforeTabs: current.tabs,
      beforeActiveTabId: current.activeTabId,
      beforeTitle: from.name,
      after: { workspaceId: to.id, title: to.title, tabs: plan.tabs, activeTabId: plan.activeTabId }
    })
  }

  /** Switch workspaces: the target workspace's respective tabs become the open tabs. */
  const selectWorkspace = async (workspaceId: string) => {
    const fromId = ws.activeId
    const target = ws.all.find((w) => w.id === workspaceId)
    const current = currentTabSet()
    const plan = ws.select(workspaceId, current)
    if (plan) {
      if (target) recordTransition(fromId, { id: target.id, title: target.name }, current, plan)
      await applySwitch(workspaceId, plan)
    }
  }

  /** Create + switch: a new workspace starts empty; the old tabs stay saved under theirs. */
  const createWorkspace = async (name: string, goal: string): Promise<string | null> => {
    const fromId = ws.activeId
    const current = currentTabSet()
    const { error, plan, workspaceId } = ws.create(name, goal, current)
    if (!error && plan) {
      if (workspaceId) recordTransition(fromId, { id: workspaceId, title: name.trim() }, current, plan)
      if (workspaceId) await applySwitch(workspaceId, plan)
    }
    return error
  }

  // Once workspaces are rehydrated from the local database, restore the
  // active workspace's saved tabs (replacing the blank startup tab) — once.
  const restoredTabs = useRef(false)
  useEffect(() => {
    if (!ws.ready || restoredTabs.current) return
    restoredTabs.current = true
    const saved = ws.getTabSet(ws.activeId)
    if (ws.activeId && saved.tabs.length > 0) {
      void applySwitch(ws.activeId, { closeTabIds: tabs.map((t) => t.id), tabs: saved.tabs, activeTabId: saved.activeTabId }, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.ready])

  /** Navigate to one side of a checkpoint, replacing the current tab array. */
  const navigateMemory = async (checkpointId: CheckpointId, target: MemoryNavigateTarget) => {
    const checkpoint = memory.checkpoints.find((c) => c.id === checkpointId)
    if (!checkpoint) return
    // Navigating Before marks the checkpoint restored; After goes through the
    // switchboard gate, which lists/activates the focus mode and sets its
    // tabs as the current open tabs.
    const plan =
      target === 'before'
        ? memory.restore(checkpointId, tabs)?.replaceTabs
        : ws.ensureAndSwitch(
            {
              id: checkpoint.after.workspaceId,
              name: checkpoint.after.title,
              tabs: checkpoint.after.tabs,
              activeTabId: checkpoint.after.activeTabId
            },
            currentTabSet()
          )
    // Before restores tabs into the current workspace; After lands on the focus mode.
    const workspaceId = target === 'before' ? (ws.activeId ?? '') : checkpoint.after.workspaceId
    if (!plan) return
    await applySwitch(workspaceId, plan, true)
    setMemoryOpen(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return
      if (e.key === 't') (e.preventDefault(), engine.createTab())
      if (e.key === 'w' && id) (e.preventDefault(), engine.closeTab(id))
      if (e.key === 'r' && id) (e.preventDefault(), engine.reload(id))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine, id])

  return (
    <div className="flex h-full">
      <div className="drag absolute inset-x-0 top-0 h-[44px]" />
      <Sidebar
        width={sidebar}
        onWidth={resize}
        onToggle={() => setSidebar(open ? RAIL : lastOpen)}
        onMemory={() => setMemoryOpen(true)}
        onSettings={() => setImportOpen(true)}
        ws={ws}
        onSelectWorkspace={selectWorkspace}
        onCreateWorkspace={createWorkspace}
        onWorkspaceMenuOpenChange={setWorkspaceMenuOpen}
      />
      <main className="relative flex min-w-0 flex-1 flex-col pb-2 pr-2">
        <header className="flex h-[44px] items-center" style={{ paddingLeft: Math.max(8, 80 - sidebar) }}>
          <TabStrip
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={(t) => engine.activateTab(t)}
            onClose={(t) => engine.closeTab(t)}
            onNew={() => engine.createTab()}
          />
        </header>
        <Toolbar
          tab={activeTab}
          onBack={() => id && engine.goBack(id)}
          onForward={() => id && engine.goForward(id)}
          onReload={() => id && engine.reload(id)}
          onStop={() => id && engine.stop(id)}
          onNavigate={(input) => id && engine.navigate(id, input)}
          onPreconnect={(input) => engine.preconnect(input)}
        />
        {/* Native page view paints above renderer DOM, so detach it while any
            dropdown/dialog that extends over the page area is open — notably
            the workspace dropdown from the collapsed rail. Viewport shows a
            still capture of the page meanwhile, so the site stays visible. */}
        <Viewport tab={activeTab} hidden={memoryOpen || importOpen || workspaceMenuOpen} />
      </main>
      <MemoryDialog open={memoryOpen} memory={memory} onClose={() => setMemoryOpen(false)} onNavigate={navigateMemory} />
      <ImportLoginsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => id && engine.reload(id)}
      />
    </div>
  )
}
