import { z } from 'zod'
import { requireStore } from './guards'
import { defineTool, ToolError } from './types'

export interface WorkspaceSummary {
  id: string
  name: string
  active: boolean
}

export const listWorkspaces = defineTool({
  name: 'list_workspaces',
  description: 'List workspaces and which one is active.',
  input: z.object({}),
  async execute(_, ctx): Promise<{ workspaces: WorkspaceSummary[] }> {
    const store = requireStore(ctx)
    const activeId = store.getState().activeWorkspaceId
    return { workspaces: store.list().map((w) => ({ id: w.id, name: w.name, active: w.id === activeId })) }
  }
})

export const switchWorkspace = defineTool({
  name: 'switch_workspace',
  description: 'Make a workspace active.',
  input: z.object({ workspaceId: z.string().min(1) }),
  async execute({ workspaceId }, ctx): Promise<{ workspace: WorkspaceSummary }> {
    const store = requireStore(ctx)
    const w = store.get(workspaceId)
    if (!w) throw new ToolError('not_found', `No workspace with id ${workspaceId}`)
    store.switchTo(workspaceId)
    return { workspace: { id: w.id, name: w.name, active: true } }
  }
})
