import { useEffect, useMemo, useRef, useState } from 'react'
import { useBrowser } from '@/hooks/useBrowser'
import { useMemory } from '@/hooks/useMemory'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import type { CheckpointId, WorkspaceSwitchPlan } from '@core/memory'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { createOnboarding } from '@/features/onboarding/onboarding'
import { loadOnboarding, updateProfile } from '@/features/onboarding/completeOnboarding'
import { OnboardingTotemPreview, OnboardingTotemReveal, ProfileIdentityDialog } from '@/features/identity'
import { createIdentitySpec, type IdentitySpec } from '@core/identity'
import type { CompletedOnboarding, UpdateProfileInput } from '@shared/onboarding'
import { ImportLoginsDialog } from '@/components/imports/ImportLoginsDialog'
import { MemoryDialog, type MemoryNavigateTarget } from '@/components/memory/MemoryDialog'
import { Sidebar } from '@/components/browser/Sidebar'
import { TabStrip } from '@/components/browser/TabStrip'
import { Toolbar } from '@/components/browser/Toolbar'
import { Viewport } from '@/components/browser/Viewport'
import { shouldShowStartupRecovery } from '@/components/browser/startupRecovery'
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
  // Persisted local profile (SQLite via onboarding persistence) — its
  // identity seed rebuilds the sidebar totem spec deterministically, and
  // profile + settings feed the identity influence view in Settings.
  const [completed, setCompleted] = useState<CompletedOnboarding | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const profile = completed?.profile ?? null
  const refreshProfile = () => void loadOnboarding().then(setCompleted).catch(() => {})
  /** Save a profile edit; the returned/stored value refreshes the sidebar + dialog at once. */
  const saveProfile = async (input: UpdateProfileInput): Promise<CompletedOnboarding> => {
    const updated = await updateProfile(input)
    setCompleted(updated)
    return updated
  }
  useEffect(refreshProfile, [])
  const identitySpec: IdentitySpec | null = useMemo(
    () => (profile?.identitySeed ? createIdentitySpec(profile.identitySeed) : null),
    [profile?.identitySeed]
  )

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
    // A workspace switch means the session is underway: the startup
    // recovery prompt must never show for (or after) it.
    setStartupRecovery('ineligible')
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
    setStartupRecovery('ineligible')
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

  /**
   * Delete a workspace (dropdown trash icon). Deleting a non-active one
   * leaves the open tabs alone; deleting the active one enacts the board's
   * fallback plan — the fallback workspace's tabs replace the open array,
   * or a blank tab when none remain. Returns the now-active id so the
   * native overlay menu can refresh its rows.
   */
  const deleteWorkspace = async (workspaceId: string): Promise<string | null> => {
    setStartupRecovery('ineligible')
    const { plan, workspaceId: nextId } = ws.deleteWorkspace(workspaceId, currentTabSet())
    if (plan) await applySwitch(nextId ?? '', plan)
    return plan ? nextId : ws.activeId
  }

  // Startup recovery gate for the recent-switch prompt: evaluated exactly
  // once, when workspaces have rehydrated at fresh app open. Eligible only
  // if nothing real is open — neither restored saved tabs nor a live tab
  // with a URL (the engine's blank startup tab does not count) — and a
  // checkpoint exists to recover from. Once decided it never re-arms:
  // workspace switches and real tabs opening end startup permanently, so
  // the prompt can never appear mid-session (see startupRecovery.ts).
  const [startupRecovery, setStartupRecovery] = useState<'pending' | 'eligible' | 'ineligible'>('pending')
  const startupEvaluated = useRef(false)
  useEffect(() => {
    if (!ws.ready || startupEvaluated.current) return
    startupEvaluated.current = true
    const saved = ws.getTabSet(ws.activeId)
    const hasOpenTabs = saved.tabs.some((t) => t.url) || tabs.some((t) => t.url)
    const show = shouldShowStartupRecovery({ atStartup: true, hasOpenTabs, hasCheckpoint: memory.checkpoints.length > 0 })
    setStartupRecovery(show ? 'eligible' : 'ineligible')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.ready])

  // Startup ends for good the moment the session is underway: any real tab
  // opening (including restored saved tabs landing) disarms the prompt.
  useEffect(() => {
    if (startupRecovery === 'eligible' && tabs.some((t) => t.url)) setStartupRecovery('ineligible')
  }, [tabs, startupRecovery])

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
    setStartupRecovery('ineligible')
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
  const overlayHandlers = useRef({ navigateMemory, selectWorkspace, createWorkspace, deleteWorkspace, reloadActive: () => id && engine.reload(id) })
  overlayHandlers.current = { navigateMemory, selectWorkspace, createWorkspace, deleteWorkspace, reloadActive: () => id && engine.reload(id) }

  useEffect(() => {
    if (!nativeOverlay) return
    return nativeOverlay.onAction(async (action) => {
      const h = overlayHandlers.current
      switch (action.type) {
        case 'surface:close':
          window.dispatchEvent(new CustomEvent('magic:surface-closed', { detail: action.kind }))
          if (action.kind === 'memory') setMemoryOpen(false)
          if (action.kind === 'import') setImportOpen(false)
          if (action.kind === 'profile') setProfileOpen(false)
          if (action.kind === 'onboarding') (setOnboardingOpen(false), refreshProfile())
          return null
        case 'memory:navigate':
          await h.navigateMemory(action.checkpointId, action.target)
          return null
        case 'import:imported':
          h.reloadActive()
          return null
        case 'profile:updated':
          setCompleted(action.completed)
          return null
        case 'workspace:select':
          await h.selectWorkspace(action.id)
          return null
        case 'workspace:create':
          return h.createWorkspace(action.name, action.goal)
        case 'workspace:delete':
          return h.deleteWorkspace(action.id)
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
    else if (profileOpen) nativeOverlay.showSurface({ kind: 'profile', completed })
    else if (onboardingOpen) nativeOverlay.showSurface({ kind: 'onboarding' })
  }, [nativeOverlay, memoryOpen, importOpen, profileOpen, completed, onboardingOpen, memory.checkpoints])

  // A dialog closed from the shell side (e.g. Memory navigation) must also
  // leave the native overlay. The workspace menu is not driven by these
  // flags, and this only runs when they change, so it cannot hide it.
  useEffect(() => {
    if (nativeOverlay && !memoryOpen && !importOpen && !profileOpen && !onboardingOpen) nativeOverlay.hideSurface()
  }, [nativeOverlay, memoryOpen, importOpen, profileOpen, onboardingOpen])

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
        onSettings={() => setProfileOpen(true)}
        profile={profile ? { displayName: profile.displayName, identity: identitySpec } : null}
        ws={ws}
        onSelectWorkspace={selectWorkspace}
        onCreateWorkspace={createWorkspace}
        onDeleteWorkspace={deleteWorkspace}
      />
      {/* Page area is flush with the panel edge and the window's right and
          bottom edges — no gutter or inset card around the page. */}
      <main className="relative flex min-w-0 flex-1 flex-col">
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
        {/* Startup recovery only: at fresh app open with no tabs open, offer
            to pick up the most recent switch (newest Memory checkpoint);
            restoring its Before reopens the tabs left behind. Mid-session
            blank tabs never get the prompt (startupRecovery gate above). */}
        <Viewport
          tab={activeTab}
          resume={startupRecovery === 'eligible' ? (memory.checkpoints[0] ?? null) : null}
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
            onComplete={refreshProfile}
            title="Welcome to Magic"
            renderPreview={(data, progress) => <OnboardingTotemPreview data={data} progress={progress} />}
            renderCompletion={(data) => <OnboardingTotemReveal data={data} />}
          />
          <ProfileIdentityDialog
            open={profileOpen}
            completed={completed}
            onClose={() => setProfileOpen(false)}
            onImportLogins={() => (setProfileOpen(false), setImportOpen(true))}
            onSaveProfile={saveProfile}
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
