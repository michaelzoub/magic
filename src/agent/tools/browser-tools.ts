import { z } from 'zod'
import type { TabState } from '@shared/engine'
import { resolveTab, visibleTabs, activeWorkspaceId } from './guards'
import { defineTool } from './types'

const tabId = z.string().min(1).describe('Tab id; defaults to the active tab')

export const listTabs = defineTool({
  name: 'list_tabs',
  description: 'List open tabs in the active workspace.',
  input: z.object({}),
  async execute(_, ctx): Promise<{ tabs: TabState[]; activeTabId: string | null }> {
    return visibleTabs(ctx)
  }
})

export const getActiveTab = defineTool({
  name: 'get_active_tab',
  description: 'Get the currently active tab.',
  input: z.object({}),
  async execute(_, ctx): Promise<{ tab: TabState | null }> {
    const { tabs, activeTabId } = await visibleTabs(ctx)
    return { tab: tabs.find((t) => t.id === activeTabId) ?? null }
  }
})

export const openTab = defineTool({
  name: 'open_tab',
  description: 'Open a new tab, optionally loading a URL or search query, and make it active.',
  input: z.object({ url: z.string().optional().describe('URL or search query') }),
  async execute({ url }, ctx): Promise<{ tabId: string }> {
    const workspaceId = activeWorkspaceId(ctx)
    const id = await ctx.browser.createTab(url)
    if (workspaceId && ctx.store) ctx.store.assign(id, workspaceId)
    return { tabId: id }
  }
})

export const closeTab = defineTool({
  name: 'close_tab',
  description: 'Close a tab.',
  input: z.object({ tabId: tabId.optional() }),
  async execute(input, ctx): Promise<{ closedTabId: string }> {
    const tab = await resolveTab(ctx, input.tabId)
    await ctx.browser.closeTab(tab.id)
    ctx.store?.unassign(tab.id)
    return { closedTabId: tab.id }
  }
})

export const switchTab = defineTool({
  name: 'switch_tab',
  description: 'Make a tab the active tab.',
  input: z.object({ tabId: z.string().min(1) }),
  async execute(input, ctx): Promise<{ tabId: string }> {
    const tab = await resolveTab(ctx, input.tabId)
    await ctx.browser.activateTab(tab.id)
    return { tabId: tab.id }
  }
})

export const navigate = defineTool({
  name: 'navigate',
  description: 'Load a URL or search query in a tab.',
  input: z.object({ url: z.string().min(1).describe('URL or search query'), tabId: tabId.optional() }),
  async execute(input, ctx): Promise<{ tabId: string }> {
    const tab = await resolveTab(ctx, input.tabId)
    await ctx.browser.navigate(tab.id, input.url)
    return { tabId: tab.id }
  }
})

export const goBack = defineTool({
  name: 'go_back',
  description: 'Go back in a tab\'s history.',
  input: z.object({ tabId: tabId.optional() }),
  async execute(input, ctx): Promise<{ tabId: string; navigated: boolean }> {
    const tab = await resolveTab(ctx, input.tabId)
    if (tab.canGoBack) await ctx.browser.goBack(tab.id)
    return { tabId: tab.id, navigated: tab.canGoBack }
  }
})

export const goForward = defineTool({
  name: 'go_forward',
  description: 'Go forward in a tab\'s history.',
  input: z.object({ tabId: tabId.optional() }),
  async execute(input, ctx): Promise<{ tabId: string; navigated: boolean }> {
    const tab = await resolveTab(ctx, input.tabId)
    if (tab.canGoForward) await ctx.browser.goForward(tab.id)
    return { tabId: tab.id, navigated: tab.canGoForward }
  }
})
