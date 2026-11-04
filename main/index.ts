import { app, BrowserWindow, ipcMain, nativeTheme, session } from 'electron'
import { join } from 'node:path'
import { IPC, type Bounds, type EngineCommand } from '@shared/engine'
import { IMPORT_IPC } from '@shared/import'
import { OVERLAY_IPC, type OverlayAction, type SurfaceKind, type SurfaceRequest, type TooltipRequest } from '@shared/overlay'
import { detectSources, importLogins } from './imports/chrome-import'
import { ElectronEngine } from './browser/electron-engine'
import { SqliteWorkspaceStore } from './db/workspace-db'
import { TooltipOverlay } from './browser/tooltip-overlay'
import { FloatingOverlay } from './browser/floating-overlay'
import { WORKSPACE_IPC, type PersistedTabSet, type RecordSwitchInput } from '@shared/workspaces'
import { ONBOARDING_IPC, type CompleteOnboardingInput, type UpdateProfileInput } from '@shared/onboarding'
import { AGENT_IPC, DEFAULT_ASSISTANCE, type AgentChatContext, type AssistanceSettings, type DriftAssessmentRequest, type WorkspaceSwitchNotice } from '@shared/agent'
import { BackgroundAssistance, EmbeddedAgentHost } from './agent/host'
import type { WorkspaceDirectory } from '@agent/lib/tools/ports'
import { ToolError } from '@agent/lib/tools/types'

// Rendering performance: GPU raster + zero-copy uploads keep scrolling smooth.
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

const engines = new Map<number, ElectronEngine>()
const tooltips = new Map<number, TooltipOverlay>()
const overlays = new Map<number, FloatingOverlay>()
/** In-flight overlay -> shell action requests, keyed by correlation id. */
const pendingActions = new Map<string, { resolve(v: unknown): void; reject(e: Error): void }>()
let actionSeq = 0
const agentHosts = new Map<number, EmbeddedAgentHost>()

// Workspace persistence: one SQLite database per user profile. Created lazily
// so handlers stay safe before `app.whenReady`.
let workspaceDb: SqliteWorkspaceStore | null = null
const workspaces = (): SqliteWorkspaceStore =>
  (workspaceDb ??= new SqliteWorkspaceStore(join(app.getPath('userData'), 'magic.sqlite')))

/**
 * The one global background-assistance state: shared by every window's
 * agent host, persisted as an app setting, and consulted before the agent
 * may restructure anything. Off never affects ordinary session restoration.
 */
let assistanceState: BackgroundAssistance | null = null
const assistance = (): BackgroundAssistance => {
  if (assistanceState) return assistanceState
  let initial = DEFAULT_ASSISTANCE
  try {
    const saved = workspaces().getSetting('backgroundAssistance') as Partial<AssistanceSettings> | undefined
    if (saved && typeof saved.active === 'boolean') {
      initial = {
        active: saved.active,
        excludedSites: Array.isArray(saved.excludedSites) ? saved.excludedSites.filter((s): s is string => typeof s === 'string') : [],
        excludedWorkspaceIds: Array.isArray(saved.excludedWorkspaceIds)
          ? saved.excludedWorkspaceIds.filter((s): s is string => typeof s === 'string')
          : []
      }
    }
  } catch {
    // Unreadable settings: fall back to the default rather than blocking startup.
  }
  assistanceState = new BackgroundAssistance(initial, (settings) => {
    try {
      workspaces().setSetting('backgroundAssistance', settings)
    } catch {
      // Persistence is best-effort; the in-process state still applies.
    }
  })
  return assistanceState
}

/** Listed workspaces as the agent sees them, read from the persisted snapshot. */
function listAgentWorkspaces() {
  const snap = workspaces().loadSnapshot()
  if (!snap) return []
  const listed = new Set(snap.listedIds)
  return snap.workspaces
    .filter((w) => listed.has(w.id))
    .map((w) => ({ id: w.id, name: w.name, goal: w.goal, active: w.id === snap.activeWorkspaceId }))
}

/** Agent workspace access for one window: switches go through its shell renderer, like a sidebar click. */
function workspaceDirectoryFor(win: BrowserWindow): WorkspaceDirectory {
  return {
    list: async () => listAgentWorkspaces(),
    switchTo: async (workspaceId) => {
      if (!listAgentWorkspaces().some((w) => w.id === workspaceId)) {
        throw new ToolError('not_found', `No workspace with id ${workspaceId}`)
      }
      await requestShellAction(win, { type: 'workspace:select', id: workspaceId })
    }
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 420,
    show: false,
    title: 'Magic',
    // Native macOS traffic lights, Chrome-style: hiddenInset titlebar,
    // buttons centred in the renderer's reserved 44px drag strip.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    // Open fullscreen; the native buttons/menu reveal on hover at the
    // top edge, same as Chrome in fullscreen.
    fullscreen: true,
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  const engine = new ElectronEngine(win)
  const wcId = win.webContents.id
  engines.set(wcId, engine)
  agentHosts.set(
    wcId,
    new EmbeddedAgentHost({
      appRoot: app.getAppPath(),
      engine,
      log: (m) => console.log(m),
      assistanceState: assistance(),
      workspaces: workspaceDirectoryFor(win),
      // Deterministic pre-close feedback: tell the shell which tab the
      // agent is about to close and give it a beat to paint the red
      // removal highlight before the close is enacted.
      onTabClosing: async (tabId) => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) return
        win.webContents.send(AGENT_IPC.tabClosing, tabId)
        await new Promise((r) => setTimeout(r, 800))
      }
    })
  )
  tooltips.set(wcId, new TooltipOverlay(win))
  const overlay = new FloatingOverlay(win)
  overlays.set(wcId, overlay)
  engine.subscribe((s) => {
    if (win.isDestroyed()) return
    win.webContents.send(IPC.snapshot, s)
    // A tab (re)attach may have stacked a page view above the overlay.
    overlay.raise()
  })
  void engine.createTab()

  win.once('ready-to-show', () => win.show())
  if (process.env.MAGIC_SHOT) {
    setInterval(() => {
      if (win.isDestroyed()) return
      void win.capturePage().then((img) => {
        const { writeFileSync } = require('node:fs') as typeof import('node:fs')
        writeFileSync(process.env.MAGIC_SHOT!, img.toPNG())
      }).catch(() => {})
    }, 1500)
  }
  win.on('closed', () => {
    engine.dispose()
    engines.delete(wcId)
    void agentHosts.get(wcId)?.dispose()
    agentHosts.delete(wcId)
    tooltips.get(wcId)?.dispose()
    tooltips.delete(wcId)
    overlays.get(wcId)?.dispose()
    overlays.delete(wcId)
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

const ALLOWED: ReadonlySet<EngineCommand> = new Set([
  'getSnapshot', 'createTab', 'closeTab', 'activateTab', 'moveTab', 'switchWorkspace',
  'navigate', 'goBack', 'goForward', 'reload', 'stop'
])

ipcMain.handle(IPC.invoke, (e, command: EngineCommand, ...args: unknown[]) => {
  const engine = engines.get(e.sender.id)
  if (!engine || !ALLOWED.has(command)) throw new Error(`Unknown engine command: ${command}`)
  return (engine[command] as (...a: unknown[]) => unknown)(...args)
})

ipcMain.handle(WORKSPACE_IPC.load, () => workspaces().loadSnapshot())
ipcMain.handle(WORKSPACE_IPC.upsert, (_e, record: Parameters<SqliteWorkspaceStore['upsertWorkspace']>[0]) => workspaces().upsertWorkspace(record))
ipcMain.handle(WORKSPACE_IPC.delete, (_e, workspaceId: string) => workspaces().deleteWorkspace(workspaceId))
ipcMain.handle(WORKSPACE_IPC.recordSwitch, (_e, input: RecordSwitchInput) => workspaces().recordSwitch(input))
ipcMain.handle(WORKSPACE_IPC.saveTabSet, (_e, workspaceId: string, tabSet: PersistedTabSet) => workspaces().saveTabSet(workspaceId, tabSet))
ipcMain.handle(WORKSPACE_IPC.listSwitches, (_e, limit?: number) => workspaces().listSwitches(limit))
ipcMain.handle(WORKSPACE_IPC.clearActive, () => workspaces().clearActiveWorkspace())

// Embedded agent: a workspace switch runs the agent against the new
// workspace (see main/agent/host.ts). Fails soft — never blocks switching.
ipcMain.handle(AGENT_IPC.workspaceSwitched, (e, notice: WorkspaceSwitchNotice, requestId?: string) => {
  const host = agentHosts.get(e.sender.id)
  if (!host) return { status: 'skipped', reply: null, reason: 'No agent host for this window' }
  const sender = e.sender
  return host.workspaceSwitched(notice, (event) => {
    if (requestId && !sender.isDestroyed()) sender.send(AGENT_IPC.workspaceSwitchedEvent, requestId, event)
  })
})
ipcMain.handle(AGENT_IPC.ask, (e, question: string, context: AgentChatContext, requestId?: string) => {
  const host = agentHosts.get(e.sender.id)
  if (!host) return { status: 'skipped', reply: null, reason: 'No agent host for this window' }
  const safeContext: AgentChatContext = {
    workspace: context?.workspace ?? null,
    tabs: Array.isArray(context?.tabs) ? context.tabs.map((t) => ({ title: String(t?.title ?? ''), url: String(t?.url ?? '') })) : []
  }
  const sender = e.sender
  return host.ask(String(question ?? ''), safeContext, (event) => {
    if (requestId && !sender.isDestroyed()) sender.send(AGENT_IPC.askEvent, requestId, event)
  })
})
ipcMain.handle(AGENT_IPC.assessDrift, (e, request: DriftAssessmentRequest) => {
  const host = agentHosts.get(e.sender.id)
  if (!host) return { status: 'skipped', verdicts: [], reason: 'No agent host for this window' }
  const safeRequest: DriftAssessmentRequest = {
    workspace: request?.workspace
      ? { id: String(request.workspace.id ?? ''), name: String(request.workspace.name ?? ''), goal: String(request.workspace.goal ?? '') }
      : { id: '', name: '', goal: '' },
    tabs: Array.isArray(request?.tabs)
      ? request.tabs.map((t) => ({ id: String(t?.id ?? ''), title: String(t?.title ?? ''), url: String(t?.url ?? '') })).filter((t) => t.id)
      : []
  }
  return host.assessDrift(safeRequest)
})
ipcMain.handle(AGENT_IPC.getAssistance, () => assistance().get())
ipcMain.handle(AGENT_IPC.setAssistanceActive, (_e, active: boolean) => assistance().setActive(Boolean(active)))
ipcMain.handle(AGENT_IPC.setAssistanceExclusions, (_e, excludedSites: string[], excludedWorkspaceIds: string[]) =>
  assistance().setExclusions(
    (Array.isArray(excludedSites) ? excludedSites : []).map((s) => String(s).trim().toLowerCase()).filter(Boolean),
    (Array.isArray(excludedWorkspaceIds) ? excludedWorkspaceIds : []).map(String)
  )
)
ipcMain.handle(AGENT_IPC.listAssistanceActivity, (e, limit?: number) => agentHosts.get(e.sender.id)?.listAssistanceActivity(limit) ?? [])

ipcMain.handle(ONBOARDING_IPC.complete, (_e, input: CompleteOnboardingInput) => workspaces().completeOnboarding(input))
ipcMain.handle(ONBOARDING_IPC.load, () => workspaces().loadOnboarding())
ipcMain.handle(ONBOARDING_IPC.updateProfile, (_e, input: UpdateProfileInput) => workspaces().updateProfile(input))

ipcMain.handle(IMPORT_IPC.detect, () => detectSources())
ipcMain.handle(IMPORT_IPC.importLogins, (_e, sourceId: string) => importLogins(session.defaultSession, sourceId))

ipcMain.on(IPC.preconnect, (e, input: string) => engines.get(e.sender.id)?.preconnect(input))
ipcMain.on(IPC.bounds, (e, bounds: Bounds) => engines.get(e.sender.id)?.setViewportBounds(bounds))
ipcMain.on(OVERLAY_IPC.showTooltip, (e, req: TooltipRequest) => void tooltips.get(e.sender.id)?.show(req))
ipcMain.on(OVERLAY_IPC.hideTooltip, (e) => tooltips.get(e.sender.id)?.hide())
ipcMain.on(OVERLAY_IPC.agentEvent, (e, streamId: string, event: unknown) => {
  // Sender is the shell renderer; forward to the overlay view of its window.
  const overlay = overlays.get(e.sender.id)
  if (overlay && !overlay.webContents.isDestroyed()) overlay.webContents.send(OVERLAY_IPC.agentEvent, streamId, event)
})
ipcMain.on(OVERLAY_IPC.agentNotice, (e, notice: unknown) =>
  overlays.get(e.sender.id)?.showAgentNotice(notice as Parameters<FloatingOverlay['showAgentNotice']>[0])
)
ipcMain.on(OVERLAY_IPC.driftNotice, (e, notice: unknown) =>
  overlays.get(e.sender.id)?.showDriftNotice(notice as Parameters<FloatingOverlay['showDriftNotice']>[0])
)
ipcMain.on(OVERLAY_IPC.showSurface, (e, req: SurfaceRequest) => overlays.get(e.sender.id)?.show(req))
ipcMain.on(OVERLAY_IPC.hideSurface, (e) => overlays.get(e.sender.id)?.hide())
ipcMain.on(OVERLAY_IPC.dismiss, (e, _kind: SurfaceKind) => {
  // The sender is the overlay view, not the shell: find its window's overlay.
  for (const overlay of overlays.values()) {
    if (overlay.webContents.id === e.sender.id) overlay.hide()
  }
})

/** Relay an overlay action to the shell renderer of the same window and await its result. */
ipcMain.handle(OVERLAY_IPC.action, (e, action: OverlayAction) => {
  console.log('[overlay] action', JSON.stringify(action))
  const entry = [...overlays.entries()].find(([, o]) => o.webContents.id === e.sender.id)
  if (!entry) throw new Error('Overlay action from an unknown overlay')
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) throw new Error('Shell window is gone')
  return requestShellAction(win, action)
})

/** Ask a window's shell renderer to perform an action and await its result. */
function requestShellAction(win: BrowserWindow, action: OverlayAction): Promise<unknown> {
  const shell = win.webContents
  if (win.isDestroyed() || shell.isDestroyed()) return Promise.reject(new Error('Shell window is gone'))
  const id = `a${++actionSeq}`
  return new Promise((resolve, reject) => {
    // Generous cap: a magic:ask action waits on a full agent turn (up to
    // CHAT_RUN_TIMEOUT_MS in main/agent/host.ts) before resolving.
    const timer = setTimeout(() => {
      pendingActions.delete(id)
      reject(new Error('Overlay action timed out'))
    }, 180_000)
    pendingActions.set(id, {
      resolve: (v) => (clearTimeout(timer), resolve(v)),
      reject: (err) => (clearTimeout(timer), reject(err))
    })
    shell.send(OVERLAY_IPC.actionRequest, id, action)
  })
}
ipcMain.on(OVERLAY_IPC.actionResponse, (_e, id: string, ok: boolean, value?: unknown, error?: string) => {
  const pending = pendingActions.get(id)
  if (!pending) return
  pendingActions.delete(id)
  ok ? pending.resolve(value) : pending.reject(new Error(error ?? 'Overlay action failed'))
})

app.whenReady().then(() => {
  nativeTheme.themeSource = 'system'
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
app.on('will-quit', () => workspaceDb?.close())
