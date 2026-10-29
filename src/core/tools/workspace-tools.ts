import { z } from 'zod'
import { requireWorkspaces } from './guards'
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
    const all = await requireWorkspaces(ctx).list()
    return { workspaces: all.map((w) => ({ id: w.id, name: w.name, active: w.status === 'active' })) }
  }
})

export const switchWorkspace = defineTool({
  name: 'switch_workspace',
  description: 'Make a workspace active.',
  input: z.object({ workspaceId: z.string().min(1) }),
  async execute({ workspaceId }, ctx): Promise<{ workspace: WorkspaceSummary }> {
    const workspaces = requireWorkspaces(ctx)
    if (!(await workspaces.get(workspaceId))) throw new ToolError('not_found', `No workspace with id ${workspaceId}`)
    const w = await workspaces.switchTo(workspaceId, ctx.source)
    return { workspace: { id: w.id, name: w.name, active: true } }
  }
})
