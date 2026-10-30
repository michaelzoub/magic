import { createToolRegistry, type ToolContext } from '../core/tools'
import type { BrowserStore } from '../core/workspaces'
import type { ElectronEngine } from './electron-engine'
import { ElectronPageDriver } from './electron-page-driver'

export const toolRegistry = createToolRegistry()

/** Builds the tool context for one window's engine. */
export function createElectronToolContext(
  engine: ElectronEngine,
  opts: { store?: BrowserStore } = {}
): ToolContext {
  return { browser: engine, page: new ElectronPageDriver((id) => engine.webContentsFor(id)), ...opts }
}
