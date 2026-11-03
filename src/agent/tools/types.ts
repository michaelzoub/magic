import type { z } from 'zod'
import type { ToolContext } from './ports'

export type ToolErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'forbidden'
  | 'unavailable'
  | 'failed'

export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ToolError'
  }
}

/**
 * A runtime-agnostic tool. Shape maps 1:1 onto agent frameworks
 * (name/description/input schema/execute), so adapters stay thin.
 */
export interface ToolDefinition<I extends z.ZodType = z.ZodType, O = unknown> {
  name: string
  description: string
  input: I
  execute(input: z.output<I>, ctx: ToolContext): Promise<O>
}

export type ToolResult<O> =
  | { ok: true; data: O }
  | { ok: false; error: { code: ToolErrorCode; message: string } }

export type ToolInput<T> = T extends ToolDefinition<infer I, unknown> ? z.input<I> : never
export type ToolOutput<T> = T extends ToolDefinition<z.ZodType, infer O> ? O : never

/** Identity helper that preserves input/output inference. */
export function defineTool<I extends z.ZodType, O>(tool: ToolDefinition<I, O>): ToolDefinition<I, O> {
  return tool
}
