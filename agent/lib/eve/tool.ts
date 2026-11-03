/**
 * Thin Eve adapter over a runtime-agnostic `ToolDefinition`.
 *
 * Each file in `agent/tools/` is a one-line re-export through this helper:
 * Eve derives the tool name from the filename, so the filename and
 * `def.name` must agree. Execution, validation, and error normalization
 * all stay in `agent/lib/tools/` (`ToolRegistry.execute` never throws),
 * which keeps the Eve surface replaceable.
 */
import { defineTool } from 'eve/tools'
import type { ToolDefinition } from '../tools/types'
import { ToolRegistry } from '../tools/registry'
import { getToolContext } from './context'

export function toEveTool(def: ToolDefinition) {
  const registry = new ToolRegistry([def])
  return defineTool({
    description: def.description,
    inputSchema: def.input,
    async execute(input) {
      const ctx = getToolContext()
      if (!ctx) {
        return {
          ok: false as const,
          error: {
            code: 'unavailable' as const,
            message:
              'Browser host is not connected to this agent process. ' +
              'Start the agent from the Magic app (or inject a ToolContext) before using browser tools.'
          }
        }
      }
      return registry.execute(def.name, input, ctx)
    }
  })
}
