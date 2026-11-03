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
import { ONBOARDING_IPC, type CompleteOnboardingInput } from '@shared/onboarding'
import { AGENT_IPC, type WorkspaceSwitchNotice } from '@shared/agent'
import { EmbeddedAgentHost } from './agent/host'

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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 420,
    show: false,
    title: 'Magic',
    titleBarStyle: 'hiddenInset',
    // Centred in the renderer's reserved 44px titlebar strip (Sidebar's
    // drag strip / App's header), which no visible element enters.
    trafficLightPosition: { x: 14, y: 16 },
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
  agentHosts.set(wcId, new EmbeddedAgentHost({ appRoot: app.getAppPath(), engine, log: (m) => console.log(m) }))
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

// Workspace persistence: one SQLite database per user profile. Created lazily
// so handlers stay safe before `app.whenReady`.
let workspaceDb: SqliteWorkspaceStore | null = null
const workspaces = (): SqliteWorkspaceStore =>
  (workspaceDb ??= new SqliteWorkspaceStore(join(app.getPath('userData'), 'magic.sqlite')))

ipcMain.handle(WORKSPACE_IPC.load, () => workspaces().loadSnapshot())
ipcMain.handle(WORKSPACE_IPC.upsert, (_e, record: Parameters<SqliteWorkspaceStore['upsertWorkspace']>[0]) => workspaces().upsertWorkspace(record))
ipcMain.handle(WORKSPACE_IPC.recordSwitch, (_e, input: RecordSwitchInput) => workspaces().recordSwitch(input))
ipcMain.handle(WORKSPACE_IPC.saveTabSet, (_e, workspaceId: string, tabSet: PersistedTabSet) => workspaces().saveTabSet(workspaceId, tabSet))
ipcMain.handle(WORKSPACE_IPC.listSwitches, (_e, limit?: number) => workspaces().listSwitches(limit))

// Embedded agent: a workspace switch runs the agent against the new
// workspace (see main/agent/host.ts). Fails soft — never blocks switching.
ipcMain.handle(AGENT_IPC.workspaceSwitched, (e, notice: WorkspaceSwitchNotice) => {
  const host = agentHosts.get(e.sender.id)
  if (!host) return { status: 'skipped', reply: null, reason: 'No agent host for this window' }
  return host.workspaceSwitched(notice)
})

ipcMain.handle(ONBOARDING_IPC.complete, (_e, input: CompleteOnboardingInput) => workspaces().completeOnboarding(input))
ipcMain.handle(ONBOARDING_IPC.load, () => workspaces().loadOnboarding())

ipcMain.handle(IMPORT_IPC.detect, () => detectSources())
ipcMain.handle(IMPORT_IPC.importLogins, (_e, sourceId: string) => importLogins(session.defaultSession, sourceId))

ipcMain.on(IPC.preconnect, (e, input: string) => engines.get(e.sender.id)?.preconnect(input))
ipcMain.on(IPC.bounds, (e, bounds: Bounds) => engines.get(e.sender.id)?.setViewportBounds(bounds))
ipcMain.on(OVERLAY_IPC.showTooltip, (e, req: TooltipRequest) => void tooltips.get(e.sender.id)?.show(req))
ipcMain.on(OVERLAY_IPC.hideTooltip, (e) => tooltips.get(e.sender.id)?.hide())
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
  const shell = win?.webContents
  if (!win || !shell || shell.isDestroyed()) throw new Error('Shell window is gone')
  const id = `a${++actionSeq}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingActions.delete(id)
      reject(new Error('Overlay action timed out'))
    }, 30_000)
    pendingActions.set(id, {
      resolve: (v) => (clearTimeout(timer), resolve(v)),
      reject: (err) => (clearTimeout(timer), reject(err))
    })
    shell.send(OVERLAY_IPC.actionRequest, id, action)
  })
})
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
