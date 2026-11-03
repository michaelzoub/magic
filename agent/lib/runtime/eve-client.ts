/**
 * Eve implementation of `AgentRuntime`, built on `eve/client`.
 * This is the only module outside `agent/agent.ts` + `agent/tools/` +
 * `agent/lib/eve/` that imports from `eve`.
 */
import { Client, type ClientSession } from 'eve/client'
import type { AgentRuntime, AgentTurnResult } from './types'

export interface EveRuntimeOptions {
  /** Base URL of a running Eve app (`eve dev` / deployed). */
  baseUrl?: string
}

export class EveRuntime implements AgentRuntime {
  readonly id = 'eve'
  private client: Client

  constructor(opts: EveRuntimeOptions = {}) {
    this.client = new Client({
      baseUrl: opts.baseUrl ?? process.env.EVE_AGENT_URL ?? 'http://127.0.0.1:2000'
    })
  }

  async send(message: string, opts: { sessionId?: string; signal?: AbortSignal } = {}): Promise<AgentTurnResult> {
    const { signal } = opts
    let session: ClientSession | null = null
    // Aborting detaches the read; also cancel the server-side turn so a
    // timed-out run stops executing tools instead of running on unseen.
    const cancelOnAbort = () => {
      if (session) void session.cancel().then((d) => d.result()).catch(() => {})
    }
    signal?.addEventListener('abort', cancelOnAbort, { once: true })
    try {
      if (opts.sessionId) {
        session = this.client.sessions.attach(opts.sessionId)
        const delivery = await session.send(message, { signal })
        const result = await delivery.result({ signal })
        return { sessionId: result.sessionId, reply: result.reply ?? null, status: result.status }
      }
      const created = await this.client.sessions.create({ message })
      session = created.session
      if (signal?.aborted) cancelOnAbort()
      const result = await created.delivery.result({ signal })
      return { sessionId: result.sessionId, reply: result.reply ?? null, status: result.status }
    } finally {
      signal?.removeEventListener('abort', cancelOnAbort)
    }
  }
}
