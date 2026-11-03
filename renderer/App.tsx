import { useEffect, useRef, useState } from 'react'
import { useBrowser } from '@/hooks/useBrowser'
import { useMemory } from '@/hooks/useMemory'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import type { CheckpointId, WorkspaceSwitchPlan } from '@core/memory'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { createOnboarding } from '@/features/onboarding/onboarding'
import { ImportLoginsDialog } from '@/components/imports/ImportLoginsDialog'
import { MemoryDialog, type MemoryNavigateTarget } from '@/components/memory/MemoryDialog'
import { Sidebar } from '@/components/browser/Sidebar'
import { TabStrip } from '@/components/browser/TabStrip'
import { Toolbar } from '@/components/browser/Toolbar'
import { Viewport } from '@/components/browser/Viewport'
import { embeddedAgent } from '@/adapters/agent'
import type { AgentWorkspaceInfo } from '@shared/agent'

export function App() {
  const { tabs, activeTabId, activeTab, engine } = useBrowser()
  const id = activeTab?.id
  // The side panel toggles between its two fixed widths (expanded / rail,
  // see Sidebar) — never hidden, never drag-resized through widths that
  // clip its rows.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // The tab strip clears the macOS traffic lights by an inset that depends
  // on the panel's *current* width. The Sidebar GSAP-tweens that width and
  // reports it per frame; applying it here as a direct style write (via
  // headerRef, below) keeps the inset in sync with the animation without
  // re-rendering the shell on every frame.
  const headerRef = useRef<HTMLElement>(null)
  const syncHeaderInset = (sidebarWidth: number) => {
    if (headerRef.current) headerRef.current.style.paddingLeft = `${Math.max(8, 104 - Math.round(sidebarWidth))}px`
  }
  const memory = useMemory()
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const ws = useWorkspaces()
  // In Electron, dialogs/dropdowns render in the native overlay layer
  // (window.overlay); without it (plain browser) they render in-DOM below.
  const nativeOverlay = typeof window !== 'undefined' ? window.overlay : undefined
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

  /**
   * Run the embedded agent for a completed switch: it gets the before →
   * after workspace info (name + goal) plus both tab sets, and can open/
   * close/navigate tabs in the now-active workspace via its tools.
   * Fire-and-forget — a slow or unavailable agent never delays switching.
   */
  const runSwitchAgent = (
    fromId: string | null,
    to: AgentWorkspaceInfo,
    current: ReturnType<typeof currentTabSet>,
    plan: WorkspaceSwitchPlan
  ) => {
    const from = fromId ? ws.all.find((w) => w.id === fromId) : undefined
    void embeddedAgent
      .workspaceSwitched({
        from: from ? { id: from.id, name: from.name, goal: from.goal } : null,
        to,
        outgoingTabs: current.tabs.map((t) => ({ title: t.title, url: t.url })),
        incomingTabs: plan.tabs.map((t) => ({ title: t.title ?? '', url: t.url }))
      })
      .then((r) => {
        if (r.status === 'failed' || r.status === 'skipped') console.info('[agent] workspace switch run', r.status, r.reason ?? '')
        else if (r.reply) console.info('[agent] workspace switch run', r.status, r.reply)
      })
      .catch(() => {})
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
      if (target) runSwitchAgent(fromId, { id: target.id, name: target.name, goal: target.goal }, current, plan)
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
      if (workspaceId) runSwitchAgent(fromId, { id: workspaceId, name: name.trim(), goal: goal.trim() }, current, plan)
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
    const fromId = ws.activeId
    const current = currentTabSet()
    await applySwitch(workspaceId, plan, true)
    if (target === 'after') {
      runSwitchAgent(fromId, { id: workspaceId, name: checkpoint.after.title, goal: '' }, current, plan)
    }
    setMemoryOpen(false)
  }

  // --- Native overlay surfaces -------------------------------------------------
  // Latest callbacks for the (once-registered) overlay action handler.
  const overlayHandlers = useRef({ navigateMemory, selectWorkspace, createWorkspace, reloadActive: () => id && engine.reload(id) })
  overlayHandlers.current = { navigateMemory, selectWorkspace, createWorkspace, reloadActive: () => id && engine.reload(id) }

  useEffect(() => {
    if (!nativeOverlay) return
    return nativeOverlay.onAction(async (action) => {
      const h = overlayHandlers.current
      switch (action.type) {
        case 'surface:close':
          window.dispatchEvent(new CustomEvent('magic:surface-closed', { detail: action.kind }))
          if (action.kind === 'memory') setMemoryOpen(false)
          if (action.kind === 'import') setImportOpen(false)
          if (action.kind === 'onboarding') setOnboardingOpen(false)
          return null
        case 'memory:navigate':
          await h.navigateMemory(action.checkpointId, action.target)
          return null
        case 'import:imported':
          h.reloadActive()
          return null
        case 'workspace:select':
          await h.selectWorkspace(action.id)
          return null
        case 'workspace:create':
          return h.createWorkspace(action.name, action.goal)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeOverlay])

  // Push the open dialog (if any) into the native overlay; it re-renders there
  // on every push, so live data (Memory checkpoints) stays current.
  useEffect(() => {
    if (!nativeOverlay) return
    if (memoryOpen) nativeOverlay.showSurface({ kind: 'memory', checkpoints: memory.checkpoints })
    else if (importOpen) nativeOverlay.showSurface({ kind: 'import' })
    else if (onboardingOpen) nativeOverlay.showSurface({ kind: 'onboarding' })
  }, [nativeOverlay, memoryOpen, importOpen, onboardingOpen, memory.checkpoints])

  // A dialog closed from the shell side (e.g. Memory navigation) must also
  // leave the native overlay. The workspace menu is not driven by these
  // flags, and this only runs when they change, so it cannot hide it.
  useEffect(() => {
    if (nativeOverlay && !memoryOpen && !importOpen && !onboardingOpen) nativeOverlay.hideSurface()
  }, [nativeOverlay, memoryOpen, importOpen, onboardingOpen])

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
    <div className="relative flex h-full">
      <div className="drag absolute inset-x-0 top-0 h-[44px]" />
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onWidthChange={syncHeaderInset}
        onMemory={() => setMemoryOpen(true)}
        memoryCount={memory.checkpoints.length}
        onSettings={() => setImportOpen(true)}
        ws={ws}
        onSelectWorkspace={selectWorkspace}
        onCreateWorkspace={createWorkspace}
      />
      {/* Page area sits on the chrome background as an inset, layered card
          (see Viewport), with the same bottom/right gutter it had before
          the restyle made everything flush with the panel. */}
      <main className="relative flex min-w-0 flex-1 flex-col pb-2 pr-2">
        {/* Traffic lights occupy the top-left ~68px of the window, over the
            sidebar's reserved drag strip. The rail (52px) is narrower than
            that, so on the rail the header pads tabs clear of them. */}
        {/* No paddingLeft in React props: Sidebar reports its animated
            width (mount + every tween frame) and syncHeaderInset writes it
            directly. A state-derived style here would snap to the target
            inset on the toggle render, one frame before GSAP's first
            frame — the jump this avoids. */}
        <header ref={headerRef} className="flex h-[44px] items-center">
          <TabStrip
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={(t) => engine.activateTab(t)}
            onClose={(t) => engine.closeTab(t)}
            onNew={() => engine.createTab()}
            onMove={(t, toIndex) => engine.moveTab(t, toIndex)}
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
        {/* Dialogs/dropdowns live in the native overlay layer above the
            page view (see overlay effects above), so the page stays live
            and attached underneath them at all times. */}
        {/* Blank tabs offer to pick up the most recent switch (newest Memory
            checkpoint): restoring its Before reopens the tabs left behind. */}
        <Viewport
          tab={activeTab}
          resume={memory.checkpoints[0] ?? null}
          onResume={() => {
            const latest = memory.checkpoints[0]
            if (latest) void navigateMemory(latest.id, 'before')
          }}
        />
      </main>
      {!nativeOverlay && (
        <>
          <OnboardingWizard
            flow={onboardingFlow.current}
            open={onboardingOpen}
            onClose={() => setOnboardingOpen(false)}
            title="Welcome to Magic"
          />
          <MemoryDialog open={memoryOpen} checkpoints={memory.checkpoints} onClose={() => setMemoryOpen(false)} onNavigate={navigateMemory} />
          <ImportLoginsDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            onImported={() => id && engine.reload(id)}
          />
        </>
      )}
    </div>
  )
}
