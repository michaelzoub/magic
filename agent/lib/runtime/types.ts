/**
 * Framework-agnostic agent runtime contract.
 *
 * App code (Electron main, renderer adapters, tests) depends only on this
 * interface. The Eve implementation lives in `./eve-client.ts`; swapping in
 * another runtime (direct AI SDK loop, another framework, a fake) means
 * writing one more implementation of this interface and pointing
 * `createAgentRuntime()` at it — no call-site changes.
 */

import type { AgentStreamEvent } from '@shared/agent'

export type { AgentStreamEvent }

export interface AgentTurnResult {
  sessionId: string
  /** Final reply text, or null when the turn produced none (e.g. paused). */
  reply: string | null
  status: 'completed' | 'awaiting-input' | 'failed' | 'cancelled'
}

export interface AgentRuntime {
  /** Stable runtime id, e.g. `eve`. Surfaced in logs/diagnostics. */
  readonly id: string
  /**
   * Sends one message; creates a session when `sessionId` is omitted.
   * When `signal` aborts, the read is detached and implementations
   * should also cancel the underlying turn where they can.
   */
  send(message: string, opts?: { sessionId?: string; signal?: AbortSignal }): Promise<AgentTurnResult>
  /**
   * Optional streaming twin of `send`: same turn, but `onEvent` receives
   * reply text deltas and tool-call activity live as the runtime produces
   * them. Runtimes without streaming omit it; callers fall back to `send`.
   */
  sendStream?(
    message: string,
    opts: { sessionId?: string; signal?: AbortSignal; onEvent: (event: AgentStreamEvent) => void }
  ): Promise<AgentTurnResult>
}
