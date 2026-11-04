/**
 * Eve implementation of `AgentRuntime`, built on `eve/client`.
 * This is the only module outside `agent/agent.ts` + `agent/tools/` +
 * `agent/lib/eve/` that imports from `eve`.
 */
import { Client, type ClientSession, type SessionStreamEvent } from 'eve/client'
import type { AgentStreamEvent, AgentRuntime, AgentTurnResult } from './types'

export interface EveRuntimeOptions {
  /** Base URL of a running Eve app (`eve dev` / deployed). */
  baseUrl?: string
}

/**
 * Translates Eve's raw session stream into the runtime-agnostic
 * `AgentStreamEvent` vocabulary: reply text deltas and tool-call
 * activity. Stateful per turn: content parts announce their kind on the
 * first delta, and tool names learned at `call.requested` are joined
 * back onto `call.settled` (which carries no name).
 */
export class EveStreamMapper {
  private partKinds = new Map<string, string>()
  private callNames = new Map<string, string>()

  map(event: SessionStreamEvent): AgentStreamEvent | null {
    switch (event.type) {
      case 'content.delta': {
        const { partId, kind, delta } = event.data
        if (kind) this.partKinds.set(partId, kind)
        const effective = kind ?? this.partKinds.get(partId) ?? 'text'
        // Reasoning streams too, but it is not reply text; the UI shows
        // tool calls + reply, so reasoning parts are dropped here.
        return effective === 'text' && delta ? { type: 'text-delta', text: delta } : null
      }
      case 'call.requested': {
        const { callId, capability, input } = event.data
        if (capability.kind !== 'tool') return null
        this.callNames.set(callId, capability.name)
        return { type: 'tool-call', id: callId, name: capability.name, input: input ?? undefined }
      }
      case 'call.settled': {
        const { callId, outcome, error } = event.data
        const name = this.callNames.get(callId)
        if (!name) return null // not a tool call we announced (agent/control/skill)
        this.callNames.delete(callId)
        return { type: 'tool-result', id: callId, name, outcome, error: error?.message }
      }
      default:
        return null
    }
  }
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
    const { delivery, release } = await this.openDelivery(message, opts)
    try {
      const result = await delivery.result({ signal: opts.signal })
      return { sessionId: result.sessionId, reply: result.reply ?? null, status: result.status }
    } finally {
      release()
    }
  }

  async sendStream(
    message: string,
    opts: { sessionId?: string; signal?: AbortSignal; onEvent: (event: AgentStreamEvent) => void }
  ): Promise<AgentTurnResult> {
    const { delivery, release } = await this.openDelivery(message, opts)
    try {
      // Stream and result are independent reads of the same delivery: drain
      // the stream live, then read the settlement summary for the final reply.
      const mapper = new EveStreamMapper()
      for await (const event of delivery.stream({ signal: opts.signal })) {
        const mapped = mapper.map(event)
        if (mapped) opts.onEvent(mapped)
      }
      const result = await delivery.result({ signal: opts.signal })
      return { sessionId: result.sessionId, reply: result.reply ?? null, status: result.status }
    } finally {
      release()
    }
  }

  /** Opens a turn and wires abort -> server-side cancel. Returns the delivery receipt. */
  private async openDelivery(
    message: string,
    opts: { sessionId?: string; signal?: AbortSignal }
  ): Promise<{ session: ClientSession; delivery: Awaited<ReturnType<ClientSession['send']>>; release: () => void }> {
    const { signal } = opts
    let session: ClientSession | null = null
    // Aborting detaches the read; also cancel the server-side turn so a
    // timed-out run stops executing tools instead of running on unseen.
    const cancelOnAbort = () => {
      if (session) void session.cancel().then((d) => d.result()).catch(() => {})
    }
    signal?.addEventListener('abort', cancelOnAbort, { once: true })
    const release = () => signal?.removeEventListener('abort', cancelOnAbort)
    try {
      if (opts.sessionId) {
        session = this.client.sessions.attach(opts.sessionId)
        const delivery = await session.send(message, { signal })
        return { session, delivery, release }
      }
      const created = await this.client.sessions.create({ message })
      session = created.session
      if (signal?.aborted) cancelOnAbort()
      return { session, delivery: created.delivery, release }
    } catch (err) {
      release()
      throw err
    }
  }
}
