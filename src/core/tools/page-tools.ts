import { z } from 'zod'
import type { PageContent, PageElement } from './ports'
import { resolveTab } from './guards'
import { defineTool } from './types'

const tabId = z.string().min(1).optional().describe('Tab id; defaults to the active tab')
const selector = z.string().min(1).describe('CSS selector')
const index = z.number().int().min(0).default(0).describe('Which match of the selector to use')

export const getPageContent = defineTool({
  name: 'get_page_content',
  description: 'Read the visible text content of a page.',
  input: z.object({ tabId, maxLength: z.number().int().positive().max(200_000).default(20_000) }),
  async execute(input, ctx): Promise<PageContent> {
    const tab = await resolveTab(ctx, input.tabId)
    return ctx.page.getContent(tab.id, { maxLength: input.maxLength })
  }
})

export const queryElements = defineTool({
  name: 'query_elements',
  description: 'Find elements matching a CSS selector and return their text and key attributes.',
  input: z.object({ selector, tabId, limit: z.number().int().positive().max(200).default(20) }),
  async execute(input, ctx): Promise<{ elements: PageElement[] }> {
    const tab = await resolveTab(ctx, input.tabId)
    return { elements: await ctx.page.query(tab.id, input.selector, { limit: input.limit }) }
  }
})

export const clickElement = defineTool({
  name: 'click_element',
  description: 'Click an element matching a CSS selector.',
  input: z.object({ selector, index, tabId }),
  async execute(input, ctx): Promise<{ tabId: string }> {
    const tab = await resolveTab(ctx, input.tabId)
    await ctx.page.click(tab.id, input.selector, input.index)
    return { tabId: tab.id }
  }
})

export const typeText = defineTool({
  name: 'type_text',
  description: 'Type text into an input, textarea, or contenteditable element.',
  input: z.object({
    selector,
    text: z.string(),
    index,
    tabId,
    clear: z.boolean().default(true).describe('Replace existing value'),
    submit: z.boolean().default(false).describe('Press Enter afterwards')
  }),
  async execute(input, ctx): Promise<{ tabId: string }> {
    const tab = await resolveTab(ctx, input.tabId)
    await ctx.page.type(tab.id, input.selector, input.index, input.text, { clear: input.clear, submit: input.submit })
    return { tabId: tab.id }
  }
})
