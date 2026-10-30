import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'node:path'
import { IPC, type Bounds, type EngineCommand } from '@shared/engine'
import { OVERLAY_IPC, type TooltipRequest } from '@shared/overlay'
import { ElectronEngine } from './electron-engine'
import { TooltipOverlay } from './tooltip-overlay'

// Rendering performance: GPU raster + zero-copy uploads keep scrolling smooth.
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

const engines = new Map<number, ElectronEngine>()
const tooltips = new Map<number, TooltipOverlay>()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 420,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
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
  tooltips.set(wcId, new TooltipOverlay(win))
  engine.subscribe((s) => !win.isDestroyed() && win.webContents.send(IPC.snapshot, s))
  void engine.createTab()

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    engine.dispose()
    engines.delete(wcId)
    tooltips.get(wcId)?.dispose()
    tooltips.delete(wcId)
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

const ALLOWED: ReadonlySet<EngineCommand> = new Set([
  'getSnapshot', 'createTab', 'closeTab', 'activateTab',
  'navigate', 'goBack', 'goForward', 'reload', 'stop'
])

ipcMain.handle(IPC.invoke, (e, command: EngineCommand, ...args: unknown[]) => {
  const engine = engines.get(e.sender.id)
  if (!engine || !ALLOWED.has(command)) throw new Error(`Unknown engine command: ${command}`)
  return (engine[command] as (...a: unknown[]) => unknown)(...args)
})

ipcMain.on(IPC.preconnect, (e, input: string) => engines.get(e.sender.id)?.preconnect(input))
ipcMain.on(IPC.bounds, (e, bounds: Bounds) => engines.get(e.sender.id)?.setViewportBounds(bounds))
ipcMain.on(OVERLAY_IPC.showTooltip, (e, req: TooltipRequest) => void tooltips.get(e.sender.id)?.show(req))
ipcMain.on(OVERLAY_IPC.hideTooltip, (e) => tooltips.get(e.sender.id)?.hide())

app.whenReady().then(() => {
  nativeTheme.themeSource = 'system'
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
