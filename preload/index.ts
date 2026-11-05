import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type BrowserEngine, type EngineCommand, type EngineSnapshot } from '@shared/engine'
import { IMPORT_IPC, type LoginImporter } from '@shared/import'
import { OVERLAY_IPC, type OverlayAction, type OverlayHost, type ShellOverlay, type SurfaceRequest } from '@shared/overlay'
import { WORKSPACE_IPC, type WorkspacePersistence } from '@shared/workspaces'
import { ONBOARDING_IPC, type OnboardingPersistence } from '@shared/onboarding'
import { AGENT_IPC, type EmbeddedAgent } from '@shared/agent'
import { MODEL_KEY_IPC, type ModelKeyBridge } from '@shared/model-key'

const call =
  <C extends EngineCommand>(command: C) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(IPC.invoke, command, ...args)

const engine: BrowserEngine = {
  getSnapshot: call('getSnapshot'),
  createTab: call('createTab'),
  closeTab: call('closeTab'),
  activateTab: call('activateTab'),
  moveTab: call('moveTab'),
  switchWorkspace: call('switchWorkspace'),
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

let actionHandler: ((action: OverlayAction) => Promise<unknown>) | null = null
ipcRenderer.on(OVERLAY_IPC.actionRequest, (_e, id: string, action: OverlayAction) => {
  const respond = (ok: boolean, value?: unknown, error?: string) =>
    ipcRenderer.send(OVERLAY_IPC.actionResponse, id, ok, value, error)
  if (!actionHandler) return respond(false, undefined, 'No overlay action handler in the shell')
  Promise.resolve(actionHandler(action)).then(
    (v) => respond(true, v),
    (e) => respond(false, undefined, e instanceof Error ? e.message : String(e))
  )
})

const overlay: ShellOverlay = {
  showTooltip: (req) => ipcRenderer.send(OVERLAY_IPC.showTooltip, req),
  hideTooltip: () => ipcRenderer.send(OVERLAY_IPC.hideTooltip),
  showSurface: (req) => ipcRenderer.send(OVERLAY_IPC.showSurface, req),
  hideSurface: () => ipcRenderer.send(OVERLAY_IPC.hideSurface),
  onAction: (handler) => {
    actionHandler = handler
    return () => {
      if (actionHandler === handler) actionHandler = null
    }
  },
  pushMagicAgentEvent: (streamId, event) => ipcRenderer.send(OVERLAY_IPC.agentEvent, streamId, event),
  showAgentNotice: (notice) => ipcRenderer.send(OVERLAY_IPC.agentNotice, notice),
  showDriftNotice: (notice) => ipcRenderer.send(OVERLAY_IPC.driftNotice, notice)
}

const overlayHost: OverlayHost = {
  onSurface: (handler) => {
    const listener = (_: unknown, req: SurfaceRequest | null) => handler(req)
    ipcRenderer.on(OVERLAY_IPC.surface, listener)
    return () => ipcRenderer.removeListener(OVERLAY_IPC.surface, listener)
  },
  requestAction: (action) => ipcRenderer.invoke(OVERLAY_IPC.action, action),
  onAgentEvent: (handler) => {
    const listener = (_: unknown, streamId: string, event: Parameters<typeof handler>[1]) => handler(streamId, event)
    ipcRenderer.on(OVERLAY_IPC.agentEvent, listener)
    return () => ipcRenderer.removeListener(OVERLAY_IPC.agentEvent, listener)
  },
  onAgentNotice: (handler) => {
    const listener = (_: unknown, notice: Parameters<typeof handler>[0]) => handler(notice)
    ipcRenderer.on(OVERLAY_IPC.agentNotice, listener)
    return () => ipcRenderer.removeListener(OVERLAY_IPC.agentNotice, listener)
  },
  reportNoticeHeight: (px) => ipcRenderer.send(OVERLAY_IPC.noticeHeight, px),
  onDriftNotice: (handler) => {
    const listener = (_: unknown, notice: Parameters<typeof handler>[0]) => handler(notice)
    ipcRenderer.on(OVERLAY_IPC.driftNotice, listener)
    return () => ipcRenderer.removeListener(OVERLAY_IPC.driftNotice, listener)
  },
  dismiss: (kind) => {
    console.log('[overlay-host] dismiss', kind, new Error().stack?.split('\n').slice(2, 6).join(' | '))
    ipcRenderer.send(OVERLAY_IPC.dismiss, kind)
    void ipcRenderer.invoke(OVERLAY_IPC.action, { type: 'surface:close', kind } satisfies OverlayAction).catch(() => {})
  }
}

const importer: LoginImporter = {
  detect: () => ipcRenderer.invoke(IMPORT_IPC.detect),
  importLogins: (sourceId) => ipcRenderer.invoke(IMPORT_IPC.importLogins, sourceId)
}

const workspaces: WorkspacePersistence = {
  load: () => ipcRenderer.invoke(WORKSPACE_IPC.load),
  upsertWorkspace: (record) => ipcRenderer.invoke(WORKSPACE_IPC.upsert, record),
  deleteWorkspace: (workspaceId) => ipcRenderer.invoke(WORKSPACE_IPC.delete, workspaceId),
  recordSwitch: (input) => ipcRenderer.invoke(WORKSPACE_IPC.recordSwitch, input),
  saveTabSet: (workspaceId, tabSet) => ipcRenderer.invoke(WORKSPACE_IPC.saveTabSet, workspaceId, tabSet),
  clearActiveWorkspace: () => ipcRenderer.invoke(WORKSPACE_IPC.clearActive),
  listSwitches: (limit) => ipcRenderer.invoke(WORKSPACE_IPC.listSwitches, limit)
}

const onboarding: OnboardingPersistence = {
  completeOnboarding: (input) => ipcRenderer.invoke(ONBOARDING_IPC.complete, input),
  loadOnboarding: () => ipcRenderer.invoke(ONBOARDING_IPC.load),
  updateProfile: (input) => ipcRenderer.invoke(ONBOARDING_IPC.updateProfile, input)
}

const agent: EmbeddedAgent = {
  workspaceSwitched: (notice, onEvent) => {
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const listener = (_: unknown, id: string, event: Parameters<NonNullable<typeof onEvent>>[0]) => {
      if (id === requestId) onEvent?.(event)
    }
    if (onEvent) ipcRenderer.on(AGENT_IPC.workspaceSwitchedEvent, listener)
    return ipcRenderer.invoke(AGENT_IPC.workspaceSwitched, notice, requestId).finally(() => {
      if (onEvent) ipcRenderer.removeListener(AGENT_IPC.workspaceSwitchedEvent, listener)
    })
  },
  ask: (question, context, onEvent) => {
    // Stream events come back on a side channel tagged with this request id
    // (invoke() alone is request/response and cannot stream).
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const listener = (_: unknown, id: string, event: Parameters<NonNullable<typeof onEvent>>[0]) => {
      if (id === requestId) onEvent?.(event)
    }
    if (onEvent) ipcRenderer.on(AGENT_IPC.askEvent, listener)
    return ipcRenderer.invoke(AGENT_IPC.ask, question, context, requestId).finally(() => {
      if (onEvent) ipcRenderer.removeListener(AGENT_IPC.askEvent, listener)
    })
  },
  onTabClosing: (listener) => {
    const handler = (_: unknown, tabId: string) => listener(tabId)
    ipcRenderer.on(AGENT_IPC.tabClosing, handler)
    return () => ipcRenderer.removeListener(AGENT_IPC.tabClosing, handler)
  },
  assessDrift: (request) => ipcRenderer.invoke(AGENT_IPC.assessDrift, request),
  getAssistance: () => ipcRenderer.invoke(AGENT_IPC.getAssistance),
  setAssistanceActive: (active) => ipcRenderer.invoke(AGENT_IPC.setAssistanceActive, active),
  setAssistanceExclusions: (excludedSites, excludedWorkspaceIds) =>
    ipcRenderer.invoke(AGENT_IPC.setAssistanceExclusions, excludedSites, excludedWorkspaceIds),
  listAssistanceActivity: (limit) => ipcRenderer.invoke(AGENT_IPC.listAssistanceActivity, limit)
}

const modelKey: ModelKeyBridge = {
  status: () => ipcRenderer.invoke(MODEL_KEY_IPC.status),
  set: (key) => ipcRenderer.invoke(MODEL_KEY_IPC.set, key),
  clear: () => ipcRenderer.invoke(MODEL_KEY_IPC.clear)
}

contextBridge.exposeInMainWorld('agent', agent)
contextBridge.exposeInMainWorld('modelKey', modelKey)
contextBridge.exposeInMainWorld('onboarding', onboarding)
contextBridge.exposeInMainWorld('workspaces', workspaces)
contextBridge.exposeInMainWorld('engine', engine)
contextBridge.exposeInMainWorld('importer', importer)
contextBridge.exposeInMainWorld('overlay', overlay)
contextBridge.exposeInMainWorld('overlayHost', overlayHost)
contextBridge.exposeInMainWorld('platform', process.platform)
