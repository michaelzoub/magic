import { createToolRegistry, type ToolContext } from '@agent/lib/tools'
import type { WorkspaceDirectory } from '@agent/lib/tools/ports'
import type { BrowserStore } from '@core/workspaces'
import type { BrowserEngine } from '@shared/engine'
import type { ElectronEngine } from '../browser/electron-engine'
import { ElectronPageDriver } from '../browser/electron-page-driver'

export const toolRegistry = createToolRegistry()

/**
 * Builds the tool context for one window's engine. Agent-initiated tab
 * closes first await `onTabClosing`, giving the shell a deterministic
 * window to paint the tab's removal highlight before the tab exists no
 * longer — stream events alone race the close and can arrive after the
 * tab is already gone.
 */
export function createElectronToolContext(
  engine: ElectronEngine,
  opts: { store?: BrowserStore; workspaces?: WorkspaceDirectory; onTabClosing?: (tabId: string) => Promise<void> | void } = {}
): ToolContext {
  const browser: BrowserEngine = {
    getSnapshot: () => engine.getSnapshot(),
    subscribe: (listener) => engine.subscribe(listener),
    createTab: (url) => engine.createTab(url),
    closeTab: async (id) => {
      await opts.onTabClosing?.(id)
      await engine.closeTab(id)
    },
    activateTab: (id) => engine.activateTab(id),
    moveTab: (id, toIndex) => engine.moveTab(id, toIndex),
    switchWorkspace: (workspaceId, tabs, activeIndex, reset) => engine.switchWorkspace(workspaceId, tabs, activeIndex, reset),
    navigate: (id, input) => engine.navigate(id, input),
    goBack: (id) => engine.goBack(id),
    goForward: (id) => engine.goForward(id),
    reload: (id) => engine.reload(id),
    stop: (id) => engine.stop(id),
    preconnect: (input) => engine.preconnect(input),
    setViewportBounds: (bounds) => engine.setViewportBounds(bounds)
  }
  return {
    browser,
    page: new ElectronPageDriver((id) => engine.webContentsFor(id)),
    ...(opts.store ? { store: opts.store } : {}),
    ...(opts.workspaces ? { workspaces: opts.workspaces } : {})
  }
}
