import { createToolRegistry, type ToolContext } from '../core/tools'
import type { ChangeSource, TabAssignmentService, WorkspaceService } from '../core/workspaces'
import type { ElectronEngine } from './electron-engine'
import { ElectronPageDriver } from './electron-page-driver'

export const toolRegistry = createToolRegistry()

/** Builds the tool context for one window's engine. */
export function createElectronToolContext(
  engine: ElectronEngine,
  opts: { source: ChangeSource; workspaces?: WorkspaceService; tabAssignments?: TabAssignmentService }
): ToolContext {
  return { browser: engine, page: new ElectronPageDriver((id) => engine.webContentsFor(id)), ...opts }
}
