import type { ToolContext } from './ports'
import { ToolError, type ToolDefinition, type ToolResult } from './types'
import * as browser from './browser-tools'
import * as page from './page-tools'
import * as workspace from './workspace-tools'

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  constructor(tools: readonly ToolDefinition[] = []) {
    for (const t of tools) this.register(t)
  }

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) throw new Error(`Duplicate tool name: ${tool.name}`)
    this.tools.set(tool.name, tool)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  /** Validates input, runs the tool, and normalizes every failure into a ToolResult. Never throws. */
  async execute(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult<unknown>> {
    const tool = this.tools.get(name)
    if (!tool) return { ok: false, error: { code: 'not_found', message: `Unknown tool: ${name}` } }

    const parsed = tool.input.safeParse(rawInput ?? {})
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
      return { ok: false, error: { code: 'invalid_input', message } }
    }
    try {
      return { ok: true, data: await tool.execute(parsed.data, ctx) }
    } catch (err) {
      if (err instanceof ToolError) return { ok: false, error: { code: err.code, message: err.message } }
      return { ok: false, error: { code: 'failed', message: err instanceof Error ? err.message : String(err) } }
    }
  }
}

export const browserTools = [
  browser.listTabs, browser.getActiveTab, browser.openTab, browser.closeTab, browser.switchTab,
  browser.navigate, browser.goBack, browser.goForward,
  page.getPageContent, page.queryElements, page.clickElement, page.typeText,
  workspace.listWorkspaces, workspace.switchWorkspace
] as const satisfies readonly ToolDefinition<any, any>[]

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry(browserTools as readonly ToolDefinition[])
}
