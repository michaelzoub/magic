import type { TabId, TabState } from '@shared/engine'
import type { BrowserStore } from '../workspaces'
import type { ToolContext } from './ports'
import { ToolError } from './types'

/** The workspace that currently owns tool actions, or null when no store is wired. */
export function activeWorkspaceId(ctx: ToolContext): string | null {
  return ctx.store?.getState().activeWorkspaceId ?? null
}

/** Tabs visible to tools: all tabs, or only those in the active workspace when a store is wired. */
export async function visibleTabs(ctx: ToolContext): Promise<{ tabs: TabState[]; activeTabId: TabId | null }> {
  const snapshot = await ctx.browser.getSnapshot()
  const workspaceId = activeWorkspaceId(ctx)
  if (!workspaceId || !ctx.store) return snapshot
  const owned = new Set(ctx.store.listTabs(workspaceId))
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

  const workspaceId = activeWorkspaceId(ctx)
  if (workspaceId && ctx.store) {
    const owner = ctx.store.getWorkspaceForTab(id)
    if (owner !== workspaceId) throw new ToolError('forbidden', `Tab ${id} is not in the active workspace`)
  }
  return tab
}

export function requireStore(ctx: ToolContext): BrowserStore {
  if (!ctx.store) throw new ToolError('unavailable', 'Workspaces are not available')
  return ctx.store
}
