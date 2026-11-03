import { useEffect, useRef, useState } from 'react'
import { useBrowser } from '@/hooks/useBrowser'
import { useMemory } from '@/hooks/useMemory'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import type { CheckpointId, WorkspaceSwitchPlan } from '@core/memory'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { createOnboarding } from '@/features/onboarding/onboarding'
import { ImportLoginsDialog } from '@/components/imports/ImportLoginsDialog'
import { MemoryDialog, type MemoryNavigateTarget } from '@/components/memory/MemoryDialog'
import { RAIL, Sidebar } from '@/components/browser/Sidebar'
import { IconButton } from '@/components/ui/IconButton'
import { SidebarIcon } from '@/components/ui/icons'
import { TabStrip } from '@/components/browser/TabStrip'
import { Toolbar } from '@/components/browser/Toolbar'
import { Viewport } from '@/components/browser/Viewport'

export function App() {
  const { tabs, activeTabId, activeTab, engine } = useBrowser()
  const id = activeTab?.id
  const [sidebar, setSidebar] = useState(248)
  const [lastOpen, setLastOpen] = useState(248)
  const open = sidebar > RAIL
  const resize = (w: number) => (setSidebar(w), w > RAIL && setLastOpen(w))
  const memory = useMemory()
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const ws = useWorkspaces()
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  // Redo onboarding on every app open/reload (for now): a fresh flow on
  // every mount, open immediately regardless of any previously saved
  // profile. Closing finishes/dismisses it until the next reload.
  const [onboardingOpen, setOnboardingOpen] = useState(true)
  const onboardingFlow = useRef<ReturnType<typeof createOnboarding> | null>(null)
  if (!onboardingFlow.current) onboardingFlow.current = createOnboarding()

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
        onMemory={() => setMemoryOpen(true)}
        memoryCount={memory.checkpoints.length}
        onSettings={() => setImportOpen(true)}
        ws={ws}
        onSelectWorkspace={selectWorkspace}
        onCreateWorkspace={createWorkspace}
        onWorkspaceMenuOpenChange={setWorkspaceMenuOpen}
      />
      <main className="relative flex min-w-0 flex-1 flex-col bg-chrome-panel">
        <header className="flex h-[48px] items-center" style={{ paddingLeft: Math.max(8, 80 - sidebar) }}>
          <TabStrip
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={(t) => engine.activateTab(t)}
            onClose={(t) => engine.closeTab(t)}
            onNew={() => engine.createTab()}
          />
          {/* Panel toggle lives in the window chrome, not the sidebar, so it
              stays in exactly the same spot whatever the panel state. */}
          <span className="ml-1 mr-1 shrink-0">
            <IconButton tip={open ? 'Hide sidebar' : 'Show sidebar'} onClick={() => setSidebar(open ? RAIL : lastOpen)}>
              <SidebarIcon />
            </IconButton>
          </span>
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
        <Viewport tab={activeTab} hidden={memoryOpen || importOpen || workspaceMenuOpen || onboardingOpen} />
      </main>
      <OnboardingWizard
        flow={onboardingFlow.current}
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        title="Welcome to Magic"
      />
      <MemoryDialog open={memoryOpen} memory={memory} onClose={() => setMemoryOpen(false)} onNavigate={navigateMemory} />
      <ImportLoginsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => id && engine.reload(id)}
      />
    </div>
  )
}
