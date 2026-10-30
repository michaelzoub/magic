import type { TabId, TabState } from '@shared/engine'
import type { ToolContext } from './ports'
import { ToolError } from './types'

/** The workspace that currently owns tool actions, or null when workspaces aren't wired. */
export async function activeWorkspaceId(ctx: ToolContext): Promise<string | null> {
  if (!ctx.workspaces) return null
  return (await ctx.workspaces.getActive())?.id ?? null
}

/** Tabs visible to tools: all tabs, or only those in the active workspace when assignments are enforced. */
export async function visibleTabs(ctx: ToolContext): Promise<{ tabs: TabState[]; activeTabId: TabId | null }> {
  const snapshot = await ctx.browser.getSnapshot()
  const workspaceId = await activeWorkspaceId(ctx)
  if (!workspaceId || !ctx.tabAssignments) return snapshot
  const owned = new Set(await ctx.tabAssignments.listTabs(workspaceId))
  const tabs = snapshot.tabs.filter((t) => owned.has(t.id))
  const activeTabId = snapshot.activeTabId && owned.has(snapshot.activeTabId) ? snapshot.activeTabId : null
  return { tabs, activeTabId }
}

/** Resolves `tabId` (default: active tab) and checks it belongs to the active workspace. */
export async function resolveTab(ctx: ToolContext, tabId?: TabId): Promise<TabState> {
  const snapshot = await ctx.browser.getSnapshot()
  const id = tabId ?? snapshot.activeTabId
  const tab = snapshot.tabs.find((t) => t.id === id)
  if (!id || !tab) throw new ToolError('not_found', tabId ? `No tab with id ${tabId}` : 'No active tab')

  const workspaceId = await activeWorkspaceId(ctx)
  if (workspaceId && ctx.tabAssignments) {
    const owner = await ctx.tabAssignments.getWorkspaceForTab(id)
    if (owner !== workspaceId) throw new ToolError('forbidden', `Tab ${id} is not in the active workspace`)
  }
  return tab
}

export function requireWorkspaces(ctx: ToolContext) {
  if (!ctx.workspaces) throw new ToolError('unavailable', 'Workspaces are not available')
  return ctx.workspaces
}
