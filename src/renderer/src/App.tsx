import { useEffect, useState } from 'react'
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
   * Enact a workspace switch: the current tab array is cleared and replaced
   * with the plan's tabs — never appended to. New tabs are created first so
   * the array never transiently empties (engines auto-create a blank tab at
   * zero), then every old tab is closed and the saved active tab focused.
   */
  const applySwitch = async (plan: WorkspaceSwitchPlan) => {
    const created: string[] = []
    for (const tab of plan.tabs) created.push(await engine.createTab(tab.url || undefined))
    const active = plan.tabs.findIndex((t) => t.id === plan.activeTabId)
    if (created[active]) await engine.activateTab(created[active])
    for (const oldId of plan.closeTabIds) {
      if (!created.includes(oldId)) await engine.closeTab(oldId)
    }
  }

  /** Live tabs as a workspace tab set, for saving under the outgoing workspace. */
  const currentTabSet = () => ({
    tabs: tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, favicon: t.favicon })),
    activeTabId
  })

  /** Switch workspaces: the target workspace's respective tabs become the open tabs. */
  const selectWorkspace = async (workspaceId: string) => {
    const plan = ws.select(workspaceId, currentTabSet())
    if (plan) await applySwitch(plan)
  }

  /** Create + switch: a new workspace starts empty; the old tabs stay saved under theirs. */
  const createWorkspace = async (name: string): Promise<string | null> => {
    const { error, plan } = ws.create(name, currentTabSet())
    if (!error && plan) await applySwitch(plan)
    return error
  }

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
    if (!plan) return
    await applySwitch(plan)
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
