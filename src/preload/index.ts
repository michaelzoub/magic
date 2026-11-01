import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type BrowserEngine, type EngineCommand, type EngineSnapshot } from '@shared/engine'
import { IMPORT_IPC, type LoginImporter } from '@shared/import'
import { OVERLAY_IPC, type ShellOverlay } from '@shared/overlay'

const call =
  <C extends EngineCommand>(command: C) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(IPC.invoke, command, ...args)

const engine: BrowserEngine = {
  getSnapshot: call('getSnapshot'),
  createTab: call('createTab'),
  closeTab: call('closeTab'),
  activateTab: call('activateTab'),
  navigate: call('navigate'),
  goBack: call('goBack'),
  goForward: call('goForward'),
  reload: call('reload'),
  stop: call('stop'),
  capturePage: call('capturePage'),
  preconnect: (input) => ipcRenderer.send(IPC.preconnect, input),
  setViewportBounds: (b) => ipcRenderer.send(IPC.bounds, b),
  subscribe: (listener) => {
    const handler = (_: unknown, s: EngineSnapshot) => listener(s)
    ipcRenderer.on(IPC.snapshot, handler)
    return () => ipcRenderer.removeListener(IPC.snapshot, handler)
  }
}

const overlay: ShellOverlay = {
  showTooltip: (req) => ipcRenderer.send(OVERLAY_IPC.showTooltip, req),
  hideTooltip: () => ipcRenderer.send(OVERLAY_IPC.hideTooltip)
}

const importer: LoginImporter = {
  detect: () => ipcRenderer.invoke(IMPORT_IPC.detect),
  importLogins: (sourceId) => ipcRenderer.invoke(IMPORT_IPC.importLogins, sourceId)
}

contextBridge.exposeInMainWorld('engine', engine)
contextBridge.exposeInMainWorld('importer', importer)
contextBridge.exposeInMainWorld('overlay', overlay)
contextBridge.exposeInMainWorld('platform', process.platform)
