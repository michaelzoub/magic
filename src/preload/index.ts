import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type BrowserEngine, type EngineCommand, type EngineSnapshot } from '@shared/engine'
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

contextBridge.exposeInMainWorld('engine', engine)
contextBridge.exposeInMainWorld('overlay', overlay)
contextBridge.exposeInMainWorld('platform', process.platform)
