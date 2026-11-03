import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type BrowserEngine, type EngineCommand, type EngineSnapshot } from '@shared/engine'
import { IMPORT_IPC, type LoginImporter } from '@shared/import'
import { OVERLAY_IPC, type ShellOverlay } from '@shared/overlay'
import { WORKSPACE_IPC, type WorkspacePersistence } from '@shared/workspaces'
import { ONBOARDING_IPC, type OnboardingPersistence } from '@shared/onboarding'

const call =
  <C extends EngineCommand>(command: C) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(IPC.invoke, command, ...args)

const engine: BrowserEngine = {
  getSnapshot: call('getSnapshot'),
  createTab: call('createTab'),
  closeTab: call('closeTab'),
  activateTab: call('activateTab'),
  switchWorkspace: call('switchWorkspace'),
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

const workspaces: WorkspacePersistence = {
  load: () => ipcRenderer.invoke(WORKSPACE_IPC.load),
  upsertWorkspace: (record) => ipcRenderer.invoke(WORKSPACE_IPC.upsert, record),
  recordSwitch: (input) => ipcRenderer.invoke(WORKSPACE_IPC.recordSwitch, input),
  saveTabSet: (workspaceId, tabSet) => ipcRenderer.invoke(WORKSPACE_IPC.saveTabSet, workspaceId, tabSet),
  listSwitches: (limit) => ipcRenderer.invoke(WORKSPACE_IPC.listSwitches, limit)
}

const onboarding: OnboardingPersistence = {
  completeOnboarding: (input) => ipcRenderer.invoke(ONBOARDING_IPC.complete, input),
  loadOnboarding: () => ipcRenderer.invoke(ONBOARDING_IPC.load)
}

contextBridge.exposeInMainWorld('onboarding', onboarding)
contextBridge.exposeInMainWorld('workspaces', workspaces)
contextBridge.exposeInMainWorld('engine', engine)
contextBridge.exposeInMainWorld('importer', importer)
contextBridge.exposeInMainWorld('overlay', overlay)
contextBridge.exposeInMainWorld('platform', process.platform)
