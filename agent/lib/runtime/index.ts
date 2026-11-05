import { EveRuntime, type EveRuntimeOptions } from './eve-client'
import type { AgentRuntime } from './types'

export * from './types'
export { EveRuntime, type EveRuntimeOptions } from './eve-client'

/**
 * Runtime factory — the single hot-swap point for app code.
 * `AGENT_RUNTIME=eve` (default) is currently the only implementation;
 * add a case here when a second runtime exists.
 */
export function createAgentRuntime(opts: EveRuntimeOptions = {}): AgentRuntime {
  const kind = process.env.AGENT_RUNTIME ?? 'eve'
  switch (kind) {
    case 'eve':
      return new EveRuntime(opts)
    default:
      throw new Error(`Unknown AGENT_RUNTIME: ${kind}`)
  }
}
