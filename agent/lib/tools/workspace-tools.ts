import { z } from 'zod'
import type { ToolContext, WorkspaceSummary } from './ports'
import { defineTool, ToolError } from './types'

export type { WorkspaceSummary } from './ports'

async function listSummaries(ctx: ToolContext): Promise<WorkspaceSummary[]> {
  if (ctx.store) {
    const activeId = ctx.store.getState().activeWorkspaceId
    return ctx.store.list().map((w) => ({ id: w.id, name: w.name, goal: w.goal, active: w.id === activeId }))
  }
  if (ctx.workspaces) return ctx.workspaces.list()
  throw new ToolError('unavailable', 'Workspaces are not available')
}

export const listWorkspaces = defineTool({
  name: 'list_workspaces',
  description: 'List workspaces and which one is active (none may be active).',
  input: z.object({}),
  async execute(_, ctx): Promise<{ workspaces: WorkspaceSummary[] }> {
    return { workspaces: await listSummaries(ctx) }
  }
})

export const switchWorkspace = defineTool({
  name: 'switch_workspace',
  description: 'Make a workspace active. Works even when no workspace is currently active; get ids from list_workspaces.',
  input: z.object({ workspaceId: z.string().min(1) }),
  async execute({ workspaceId }, ctx): Promise<{ workspace: WorkspaceSummary }> {
    const w = (await listSummaries(ctx)).find((s) => s.id === workspaceId)
    if (!w) throw new ToolError('not_found', `No workspace with id ${workspaceId}`)
    if (ctx.store) ctx.store.switchTo(workspaceId)
    else await ctx.workspaces!.switchTo(workspaceId)
    return { workspace: { ...w, active: true } }
  }
})
