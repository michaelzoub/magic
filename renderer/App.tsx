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
import { canAssistanceRestructure, DEFAULT_ASSISTANCE, type AgentStreamEvent, type AgentSwitchNoticeState, type AgentTabProposal, type AgentWorkspaceInfo, type AssistanceSettings } from '@shared/agent'
import { AgentSwitchNotice } from '@/components/browser/AgentSwitchNotice'
import { WorkspaceDriftNotice } from '@/components/browser/WorkspaceDriftNotice'
import { visibleNotification } from '@core/notifications/ordering'
import { GoalDriftTracker, isAgentJudgeableTab } from '@core/workspaces/goalDrift'
import type { WorkspaceDriftNoticeState } from '@shared/overlay'
import { describeAgentEvent } from '@/components/browser/agentNotice'
import { feedbackForAgentEvent } from '@/components/browser/agentFeedback'

export function App() {
  const { tabs, activeTabId, activeTab, engine } = useBrowser()
  const id = activeTab?.id
  // The side panel toggles between expanded (drag-resizable, see
  // Sidebar) and the fixed rail — never hidden.
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
  // Serializable workspace rows for Memory cards' icons; keyed on the fields
  // they use so the overlay surface is only re-pushed when those change.
  const memoryWorkspaces = useMemo(
    () => ws.all.map((w) => ({ id: w.id, name: w.name, goal: w.goal, icon: w.icon })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.all.map((w) => `${w.id}|${w.name}|${w.icon}`).join('\n')]
  )
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
  // Visual feedback for the switch being enacted: the target row first
  // carries the preparing state, then — only once the engine confirms the
  // switch — a brief activated glow. No separate transition indicator.
  const [workspaceFeedback, setWorkspaceFeedback] = useState<{ id: string; phase: 'preparing' | 'activated' } | null>(null)
  const workspaceFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (workspaceFeedbackTimer.current) clearTimeout(workspaceFeedbackTimer.current) }, [])

  // Held long enough to be seen after an agent turn finishes (the switch
  // itself lands early in the turn, long before the reply is read).
  const WORKSPACE_ACTIVATED_HOLD_MS = 3000
  const showWorkspaceActivated = (workspaceId: string) => {
    if (workspaceFeedbackTimer.current) clearTimeout(workspaceFeedbackTimer.current)
    setWorkspaceFeedback({ id: workspaceId, phase: 'activated' })
    workspaceFeedbackTimer.current = setTimeout(
      () => setWorkspaceFeedback((f) => (f?.id === workspaceId && f.phase === 'activated' ? null : f)),
      WORKSPACE_ACTIVATED_HOLD_MS
    )
  }

  // A tab the agent is operating on right now (from live tool-call events),
  // forwarded to the TabStrip so it can be highlighted while the tool runs —
  // not just in the instant the resulting snapshot lands.
  const [tabAttention, setTabAttention] = useState<{ tabId: string; kind: 'reused' | 'removed'; seq: number } | null>(null)
  const tabAttentionSeq = useRef(0)

  /**
   * Translate live agent tool events into workspace/tab attention. Only
   * real tool calls land here; a failed tool result clears the workspace
   * preparing state instead of showing a success highlight.
   */
  // Deterministic pre-close notice from the main process: an agent tool
  // call is about to close this tab and is waiting for us to paint first.
  useEffect(() => {
    return embeddedAgent.onTabClosing((tabId) => {
      console.info('[feedback] tab closing', tabId)
      setTabAttention({ tabId, kind: 'removed', seq: ++tabAttentionSeq.current })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const observeAgentEvent = (event: AgentStreamEvent) => {
    const feedback = feedbackForAgentEvent(event, activeTabId)
    if (!feedback) return
    if (feedback.kind === 'workspace-preparing') {
      if (workspaceFeedbackTimer.current) clearTimeout(workspaceFeedbackTimer.current)
      setWorkspaceFeedback({ id: feedback.workspaceId, phase: 'preparing' })
    } else if (feedback.kind === 'workspace-failed') {
      setWorkspaceFeedback((f) => (f?.phase === 'preparing' ? null : f))
    } else {
      setTabAttention({ tabId: feedback.tabId, kind: feedback.tabKind, seq: ++tabAttentionSeq.current })
    }
  }

  const applySwitch = async (workspaceId: string, plan: WorkspaceSwitchPlan, reset = false, feedback = true) => {
    const active = plan.tabs.findIndex((t) => t.id === plan.activeTabId)
    if (feedback && workspaceId) {
      if (workspaceFeedbackTimer.current) clearTimeout(workspaceFeedbackTimer.current)
      setWorkspaceFeedback({ id: workspaceId, phase: 'preparing' })
    }
    try {
      await engine.switchWorkspace(workspaceId, plan.tabs, Math.max(active, 0), reset)
    } catch (e) {
      // Failed switch: drop the preparing state, show no activated glow.
      if (feedback) setWorkspaceFeedback((f) => (f?.id === workspaceId ? null : f))
      throw e
    }
    if (feedback && workspaceId) showWorkspaceActivated(workspaceId)
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
    if (!from || from.id === to.id) return null
    // Saved immediately (everything is saved); shown only if the agent's
    // switch run judges it meaningful. The id is minted here so the verdict
    // can be applied to exactly this checkpoint when the run finishes.
    const checkpointId = crypto.randomUUID() as CheckpointId
    memory.record({
      checkpointId,
      beforeTabs: current.tabs,
      beforeActiveTabId: current.activeTabId,
      beforeTitle: from.name,
      after: { workspaceId: to.id, title: to.title, tabs: plan.tabs, activeTabId: plan.activeTabId }
    })
    return checkpointId
  }

  /**
   * Run the embedded agent for a completed switch: it gets the before →
   * after workspace info (name + goal) plus both tab sets, and can open/
   * close/navigate tabs in the now-active workspace via its tools.
   * Fire-and-forget — a slow or unavailable agent never delays switching.
   */
  // Global background-assistance state (owned by the agent host in main;
  // this is the shell's mirror for gating + the popover). Turning it off
  // only stops the agent restructuring — switching and session restoration
  // below never consult it.
  const [assistance, setAssistance] = useState<AssistanceSettings>(DEFAULT_ASSISTANCE)
  useEffect(() => {
    void embeddedAgent.getAssistance().then(setAssistance).catch(() => {})
  }, [])
  const setAssistanceActive = async (active: boolean): Promise<AssistanceSettings> => {
    const next = await embeddedAgent.setAssistanceActive(active)
    setAssistance(next)
    return next
  }
  const setAssistanceExclusions = async (excludedSites: string[], excludedWorkspaceIds: string[]): Promise<AssistanceSettings> => {
    const next = await embeddedAgent.setAssistanceExclusions(excludedSites, excludedWorkspaceIds)
    setAssistance(next)
    return next
  }

  // Bottom-center agent notice for switch runs: shown the moment a run
  // starts, fed live traces, and turned into an approval prompt when the
  // run concludes with staged tab proposals. In Electron it is mirrored
  // into the native overlay (below) so it paints above the page view.
  const [agentNotice, setAgentNotice] = useState<AgentSwitchNoticeState | null>(null)
  const agentNoticeRun = useRef(0)

  /** Enact approved proposals, in the order the agent proposed them. */
  const applyAgentProposals = async (proposals: AgentTabProposal[]) => {
    const live = await engine.getSnapshot().catch(() => null)
    const liveIds = new Set((live?.tabs ?? tabs).map((t) => t.id))
    for (const p of proposals) {
      try {
        if (p.kind === 'open') await engine.createTab(p.url || undefined)
        else if (p.kind === 'close') {
          if (!liveIds.has(p.tabId)) continue
          // About to be removed: paint the tab light red (via the
          // TabStrip) and hold briefly before closing, so the
          // removal is seen before it happens — one tab at a time.
          setTabAttention({ tabId: p.tabId, kind: 'removed', seq: ++tabAttentionSeq.current })
          await new Promise((r) => setTimeout(r, 650))
          await engine.closeTab(p.tabId)
        }
        else if (liveIds.has(p.tabId)) await engine.navigate(p.tabId, p.url)
      } catch {
        // One stale proposal (tab already gone) must not stop the rest.
      }
    }
  }

  const runSwitchAgent = (
    fromId: string | null,
    to: AgentWorkspaceInfo,
    current: ReturnType<typeof currentTabSet>,
    plan: WorkspaceSwitchPlan,
    checkpointId?: CheckpointId | null
  ) => {
    if (!canAssistanceRestructure(assistance, to.id)) {
      console.info('[agent] workspace switch run skipped: background assistance off or workspace excluded')
      return
    }
    const from = fromId ? ws.all.find((w) => w.id === fromId) : undefined
    const runId = ++agentNoticeRun.current
    setAgentNotice({
      id: String(runId),
      fromName: from?.name ?? null,
      toName: to.name,
      phase: 'running',
      identitySeed: profile?.identitySeed ?? null,
      traces: [],
      reply: null,
      proposals: []
    })
    void embeddedAgent
      .workspaceSwitched(
        {
          from: from ? { id: from.id, name: from.name, goal: from.goal } : null,
          to,
          outgoingTabs: current.tabs.map((t) => ({ title: t.title, url: t.url })),
          incomingTabs: plan.tabs.map((t) => ({ title: t.title ?? '', url: t.url }))
        },
        (event) => {
          const trace = describeAgentEvent(event)
          if (!trace) return
          setAgentNotice((n) =>
            n && n.id === String(runId) && n.phase === 'running' && n.traces[n.traces.length - 1] !== trace
              ? { ...n, traces: [...n.traces, trace].slice(-30) }
              : n
          )
        }
      )
      .then((r) => {
        // The agent judged this switch as a checkpoint: apply its verdict.
        // No verdict (skipped/failed/unjudged) leaves it saved but hidden.
        if (checkpointId && r.checkpointVerdict) {
          memory.setMeaningful(checkpointId, r.checkpointVerdict.meaningful, r.checkpointVerdict.reason)
        }
        if (r.status === 'failed' || r.status === 'skipped') console.info('[agent] workspace switch run', r.status, r.reason ?? '')
        else if (r.reply) console.info('[agent] workspace switch run', r.status, r.reply)
        setAgentNotice((n) =>
          n && n.id === String(runId)
            ? {
                ...n,
                phase: r.status === 'completed' || r.status === 'awaiting-input' ? 'done' : r.status === 'skipped' ? 'skipped' : 'failed',
                reply: r.reply,
                reason: r.reason,
                proposals: r.proposals ?? []
              }
            : n
        )
      })
      .catch(() => {
        setAgentNotice((n) => (n && n.id === String(runId) ? { ...n, phase: 'failed', reason: 'The agent run failed.' } : n))
      })
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
      const checkpointId = target ? recordTransition(fromId, { id: target.id, title: target.name }, current, plan) : null
      await applySwitch(workspaceId, plan)
      if (target) runSwitchAgent(fromId, { id: target.id, name: target.name, goal: target.goal }, current, plan, checkpointId)
    }
  }

  /** Create + switch: a new workspace starts empty; the old tabs stay saved under theirs. */
  const createWorkspace = async (name: string, goal: string): Promise<string | null> => {
    setStartupRecovery('ineligible')
    const fromId = ws.activeId
    const current = currentTabSet()
    const { error, plan, workspaceId } = ws.create(name, goal, current)
    if (!error && plan) {
      const checkpointId = workspaceId ? recordTransition(fromId, { id: workspaceId, title: name.trim() }, current, plan) : null
      if (workspaceId) await applySwitch(workspaceId, plan)
      if (workspaceId) runSwitchAgent(fromId, { id: workspaceId, name: name.trim(), goal: goal.trim() }, current, plan, checkpointId)
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

  // Goal drift: while a workspace is active, one bare inference call (no
  // agent loop, no thinking; see @agent/lib/drift) judges each new tab
  // navigation against its goal — no local heuristic
  // decides related/unrelated. A single model-judged unrelated navigation
  // shows the small bottom-center warning (the prompt only allows
  // `unrelated` when confident, so no streak is needed to filter noise);
  // the workspace stays active. The streak then restarts so the warning
  // doesn't repeat on every further tab. A skipped/failed/unjudged run yields no
  // verdicts, which counts as `unknown` and can never trigger the warning.
  // Tabs already open when a workspace becomes active are primed (never
  // judged), plus a short grace period covers the switch's tab restore, so
  // only browsing the user actually does here can trigger a warning.
  const [driftNotice, setDriftNotice] = useState<WorkspaceDriftNoticeState | null>(null)
  const driftTracker = useRef(new GoalDriftTracker(1))
  const driftSession = useRef<{ workspaceId: string; since: number } | null>(null)
  /** Tab+URL keys with an agent judgment currently in flight. */
  const driftInFlight = useRef(new Set<string>())
  const dismissDriftNotice = () => setDriftNotice(null)
  const quitDriftedWorkspace = () => {
    setDriftNotice(null)
    driftTracker.current.reset()
    driftSession.current = null
    ws.quit(currentTabSet())
    setStartupRecovery('ineligible')
  }
  useEffect(() => {
    const active = ws.all.find((w) => w.id === ws.activeId) ?? null
    if (!active) {
      driftTracker.current.reset()
      driftSession.current = null
      return
    }
    if (driftSession.current?.workspaceId !== active.id) {
      driftTracker.current.reset()
      driftSession.current = { workspaceId: active.id, since: Date.now() }
    }
    if (Date.now() - driftSession.current.since < 1000) {
      for (const t of tabs) driftTracker.current.prime(t.id, t.url)
      return
    }
    const candidates = tabs.filter(
      (t) => isAgentJudgeableTab(t.url) && !driftTracker.current.isJudged(t.id, t.url) && !driftInFlight.current.has(`${t.id}|${t.url}`)
    )
    if (candidates.length === 0) return
    for (const t of candidates) driftInFlight.current.add(`${t.id}|${t.url}`)
    const workspaceId = active.id
    void embeddedAgent
      .assessDrift({
        workspace: { id: active.id, name: active.name, goal: active.goal },
        tabs: candidates.map((t) => ({ id: t.id, title: t.title ?? '', url: t.url }))
      })
      .then((result) => {
        console.info('[drift]', result.status, result.reason ?? '', result.verdicts)
        // The user moved on while the model was judging: drop the verdicts.
        if (driftSession.current?.workspaceId !== workspaceId) return
        const byId = new Map(result.verdicts.map((v) => [v.tabId, v.verdict]))
        for (const t of candidates) {
          // No verdict for this tab (skipped/failed/unjudged) = unknown.
          if (!driftTracker.current.observe(t.id, t.url, byId.get(t.id) ?? 'unknown').shouldExit) continue
          driftTracker.current.resetStreak()
          setDriftNotice({ workspaceName: active.name })
          break
        }
      })
      .catch(() => {
        // assessDrift never rejects by contract; a broken bridge must not warn.
      })
      .finally(() => {
        for (const t of candidates) driftInFlight.current.delete(`${t.id}|${t.url}`)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, ws.activeId, ws.all])

  // Mirror the drift notice into the native overlay so it paints above the
  // page view (shell DOM can never overlap a WebContentsView).
  useEffect(() => {
    nativeOverlay?.showDriftNotice(driftNotice)
  }, [nativeOverlay, driftNotice])

  // Which notification is on screen (shell fallback rendering below; the
  // overlay applies the same ordering to the states mirrored into it).
  const visibleNoticeKind = visibleNotification({ agent: agentNotice, drift: driftNotice })

  // Startup recovery gate for the recent-switch prompt: evaluated exactly
  // once, when workspaces have rehydrated at fresh app open. Eligible only
  // if nothing real is open — neither restored saved tabs nor a live tab
  // with a URL (the engine's blank startup tab does not count) — and a
  // checkpoint exists to recover from. Once decided it never re-arms:
  // workspace switches and real tabs opening end startup permanently, so
  // the prompt can never appear mid-session (see startupRecovery.ts).
  const [startupRecovery, setStartupRecovery] = useState<'pending' | 'eligible' | 'ineligible'>('pending')
  // Only real workspace switches can be resumed: chat-question checkpoints
  // record the same workspace as Before and After ("switched from X to X").
  const latestSwitch = memory.visibleCheckpoints.find((c) => c.before.title !== c.after.title) ?? null
  const startupEvaluated = useRef(false)
  useEffect(() => {
    if (!ws.ready || startupEvaluated.current) return
    startupEvaluated.current = true
    const saved = ws.getTabSet(ws.activeId)
    const hasOpenTabs = saved.tabs.some((t) => t.url) || tabs.some((t) => t.url)
    const show = shouldShowStartupRecovery({ atStartup: true, hasOpenTabs, hasCheckpoint: latestSwitch !== null })
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
      void applySwitch(ws.activeId, { closeTabIds: tabs.map((t) => t.id), tabs: saved.tabs, activeTabId: saved.activeTabId }, true, false)
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

  /** Open a tab found from the magic popover: switch to its workspace first, then activate it. */
  const openMagicTab = async (workspaceId: string | null, tabId: string) => {
    if (workspaceId && workspaceId !== ws.activeId) await selectWorkspace(workspaceId)
    await engine.activateTab(tabId)
  }

  /**
   * Every chatbox question goes to the embedded agent: it thinks, may drive
   * the browser with its tools (agent/tools/* via the main-process bridge),
   * and its final reply is shown in the popover transcript.
   */
  const askAgent = async (request: string, onEvent?: (event: AgentStreamEvent) => void) => {
    const active = ws.all.find((w) => w.id === ws.activeId) ?? null
    // Save a checkpoint of the moment the question was asked (everything is
    // saved); the chat agent judges whether the turn made it meaningful —
    // e.g. it opened a set of tabs or built research worth returning to —
    // and only then is it shown in Memory.
    const current = currentTabSet()
    const checkpointId = crypto.randomUUID() as CheckpointId
    memory.record({
      checkpointId,
      beforeTabs: current.tabs,
      beforeActiveTabId: current.activeTabId,
      beforeTitle: active?.name ?? 'Magic chat',
      after: {
        workspaceId: active?.id ?? 'magic-chat',
        title: active?.name ?? 'Magic chat',
        tabs: current.tabs,
        activeTabId: current.activeTabId
      }
    })
    const result = await embeddedAgent.ask(
      request,
      {
        workspace: active ? { id: active.id, name: active.name, goal: active.goal } : null,
        tabs: tabs.map((t) => ({ title: t.title ?? '', url: t.url }))
      },
      (event) => {
        observeAgentEvent(event)
        onEvent?.(event)
      }
    )
    if (result.checkpointVerdict) {
      memory.setMeaningful(checkpointId, result.checkpointVerdict.meaningful, result.checkpointVerdict.reason)
    }
    return result
  }

  /** Legacy organize action: also a question for the agent now. */
  const organizeRequest = (request: string) => askAgent(request)

  /** Undo the latest recorded reorganization: restore its checkpoint's Before tabs. */
  const undoCheckpoint = async (checkpointId: string) => {
    await navigateMemory(checkpointId as CheckpointId, 'before')
  }

  // --- Native overlay surfaces -------------------------------------------------
  // Latest callbacks for the (once-registered) overlay action handler.
  const applyNoticeProposals = async (proposals: AgentTabProposal[]) => {
    setAgentNotice(null)
    await applyAgentProposals(proposals)
  }
  const dismissAgentNotice = () => setAgentNotice(null)
  const overlayHandlers = useRef({ navigateMemory, selectWorkspace, createWorkspace, deleteWorkspace, openMagicTab, organizeRequest, askAgent, undoCheckpoint, setAssistanceActive, setAssistanceExclusions, applyNoticeProposals, dismissAgentNotice, dismissDriftNotice, quitDriftedWorkspace, reloadActive: () => id && engine.reload(id) })
  overlayHandlers.current = { navigateMemory, selectWorkspace, createWorkspace, deleteWorkspace, openMagicTab, organizeRequest, askAgent, undoCheckpoint, setAssistanceActive, setAssistanceExclusions, applyNoticeProposals, dismissAgentNotice, dismissDriftNotice, quitDriftedWorkspace, reloadActive: () => id && engine.reload(id) }

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
        case 'magic:open-tab':
          await h.openMagicTab(action.workspaceId, action.tabId)
          return null
        case 'magic:organize':
          return h.organizeRequest(action.request)
        case 'magic:ask':
          // Stream events travel back to the overlay on their own channel,
          // tagged with the streamId the overlay generated for this ask.
          return h.askAgent(action.request, (event) => nativeOverlay?.pushMagicAgentEvent(action.streamId, event))
        case 'magic:set-assistance':
          return h.setAssistanceActive(action.active)
        case 'magic:set-exclusions':
          return h.setAssistanceExclusions(action.excludedSites, action.excludedWorkspaceIds)
        case 'magic:undo':
          await h.undoCheckpoint(action.checkpointId)
          return null
        case 'agent:apply-proposals':
          await h.applyNoticeProposals(action.proposals)
          return null
        case 'agent:dismiss-notice':
          h.dismissAgentNotice()
          return null
        case 'drift:dismiss-notice':
          h.dismissDriftNotice()
          return null
        case 'drift:quit-workspace':
          h.quitDriftedWorkspace()
          return null
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeOverlay])

  // Mirror the agent switch notice into the native overlay so it paints
  // above the page view (shell DOM can never overlap a WebContentsView).
  useEffect(() => {
    nativeOverlay?.showAgentNotice(agentNotice)
  }, [nativeOverlay, agentNotice])

  // Push the open dialog (if any) into the native overlay; it re-renders there
  // on every push, so live data (Memory checkpoints) stays current.
  useEffect(() => {
    if (!nativeOverlay) return
    if (memoryOpen) nativeOverlay.showSurface({ kind: 'memory', checkpoints: memory.visibleCheckpoints, workspaces: memoryWorkspaces })
    else if (importOpen) nativeOverlay.showSurface({ kind: 'import' })
    else if (profileOpen) nativeOverlay.showSurface({ kind: 'profile', completed })
    else if (onboardingOpen) nativeOverlay.showSurface({ kind: 'onboarding' })
  }, [nativeOverlay, memoryOpen, importOpen, profileOpen, completed, onboardingOpen, memory.visibleCheckpoints, memoryWorkspaces])

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
        memoryCount={memory.visibleCheckpoints.length}
        onSettings={() => setProfileOpen(true)}
        profile={profile ? { displayName: profile.displayName, identity: identitySpec, identitySeed: profile.identitySeed } : null}
        ws={ws}
        workspaceFeedback={workspaceFeedback}
        onSelectWorkspace={selectWorkspace}
        onCreateWorkspace={createWorkspace}
        onDeleteWorkspace={deleteWorkspace}
        magicTabs={tabs.map((t) => ({ id: t.id, title: t.title ?? '', url: t.url }))}
        onOpenMagicTab={(tab) => void openMagicTab(tab.workspaceId, tab.id)}
        onAskRequest={askAgent}
        assistance={assistance}
        magicActivity={memory.visibleCheckpoints.slice(0, 5).map((c) => ({
          id: c.id,
          title: `${c.before.title} → ${c.after.title}`,
          detail: `${c.before.tabs.length} tab${c.before.tabs.length === 1 ? '' : 's'} → ${c.after.tabs.length} tab${c.after.tabs.length === 1 ? '' : 's'}`,
          checkpointId: c.id as string
        }))}
        onSetAssistance={(active) => void setAssistanceActive(active)}
        onSetExclusions={(sites, workspaceIds) => void setAssistanceExclusions(sites, workspaceIds)}
        onUndoMagic={(checkpointId) => void undoCheckpoint(checkpointId)}
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
            attention={tabAttention}
            markedForRemoval={
              agentNotice?.phase === 'done' ? agentNotice.proposals.filter((p) => p.kind === 'close').map((p) => p.tabId) : undefined
            }
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
          resume={startupRecovery === 'eligible' ? latestSwitch : null}
          onResume={() => {
            if (latestSwitch) void navigateMemory(latestSwitch.id, 'before')
          }}
          workspaceName={ws.all.find((w) => w.id === ws.activeId)?.name ?? null}
          switchStats={ws.switchStats}
          recent={(() => {
            // Recently used in this workspace: live tabs with a URL first,
            // then the workspace's saved tabs, deduped by URL (cap 8).
            const seen = new Set<string>()
            const items: { id?: string; title: string; url: string; favicon?: string }[] = []
            const push = (item: { id?: string; title: string; url: string; favicon?: string }) => {
              if (!item.url || seen.has(item.url) || items.length >= 8) return
              seen.add(item.url)
              items.push(item)
            }
            for (const t of tabs) push({ id: t.id, title: t.title ?? '', url: t.url, favicon: t.favicon })
            for (const t of ws.getTabSet(ws.activeId).tabs) push({ title: t.title ?? '', url: t.url, favicon: t.favicon })
            return items
          })()}
          onNavigate={(input) => {
            setStartupRecovery('ineligible')
            if (id) void engine.navigate(id, input)
            else void engine.createTab(input)
          }}
          onOpenRecent={(item) => {
            setStartupRecovery('ineligible')
            if (item.id && tabs.some((t) => t.id === item.id)) void engine.activateTab(item.id)
            else if (id) void engine.navigate(id, item.url)
            else void engine.createTab(item.url)
          }}
          onViewAll={() => setMemoryOpen(true)}
        />
      </main>
      {/* Notification ordering (see @core/notifications/ordering): one
          visible at a time by priority; the other queues behind it. */}
      {!nativeOverlay && visibleNoticeKind === 'agent' && agentNotice && (
        <AgentSwitchNotice notice={agentNotice} onApply={(proposals) => void applyNoticeProposals(proposals)} onDismiss={dismissAgentNotice} />
      )}
      {!nativeOverlay && visibleNoticeKind === 'drift' && driftNotice && (
        <WorkspaceDriftNotice workspaceName={driftNotice.workspaceName} onDismiss={dismissDriftNotice} onQuit={quitDriftedWorkspace} />
      )}
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
          <MemoryDialog open={memoryOpen} checkpoints={memory.visibleCheckpoints} workspaces={memoryWorkspaces} onClose={() => setMemoryOpen(false)} onNavigate={navigateMemory} />
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
