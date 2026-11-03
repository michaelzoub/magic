import { describe, expect, it, vi } from 'vitest'
import type { AgentRuntime } from '@agent/lib/runtime'
import type { WorkspaceSwitchNotice } from '@shared/agent'
import type { ElectronEngine } from '../browser/electron-engine'
import { EmbeddedAgentHost } from './host'

const notice = (name: string): WorkspaceSwitchNotice => ({
  from: { id: 'a', name: 'Before', goal: 'old goal' },
  to: { id: 'b', name, goal: 'new goal' },
  outgoingTabs: [],
  incomingTabs: []
})

function hostWith(runtime: AgentRuntime, opts: { timeoutMs?: number } = {}): EmbeddedAgentHost {
  return new EmbeddedAgentHost({
    appRoot: '/nonexistent',
    engine: {} as ElectronEngine,
    runtime,
    eveServer: 'none',
    log: () => {},
    ...opts
  })
}

describe('EmbeddedAgentHost', () => {
  it('sends a before → after prompt through the runtime and returns its result', async () => {
    const send = vi.fn(async (_message: string) => ({ sessionId: 's1', reply: 'done', status: 'completed' as const }))
    const host = hostWith({ id: 'fake', send })
    const result = await host.workspaceSwitched(notice('School'))
    expect(result).toEqual({ status: 'completed', reply: 'done', runtime: 'fake' })
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0]).toContain('"Before"')
    expect(send.mock.calls[0][0]).toContain('"School"')
    await host.dispose()
  })

  it('coalesces a burst of switches into the latest notice', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const send = vi.fn(async (_message: string) => {
      await gate
      return { sessionId: 's1', reply: 'ok', status: 'completed' as const }
    })
    const host = hostWith({ id: 'fake', send })
    const first = host.workspaceSwitched(notice('One'))
    const second = host.workspaceSwitched(notice('Two'))
    const third = host.workspaceSwitched(notice('Three'))
    release()
    await Promise.all([first, second, third])
    // First run starts immediately; the queued second is superseded by the third.
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][0]).toContain('"One"')
    expect(send.mock.calls[1][0]).toContain('"Three"')
    await host.dispose()
  })

  it('aborts a run that exceeds the timeout and reports it as failed', async () => {
    const host = hostWith(
      {
        id: 'fake',
        send: (_message, opts) =>
          new Promise((_, reject) => {
            opts?.signal?.addEventListener('abort', () => reject(opts.signal?.reason), { once: true })
          })
      },
      { timeoutMs: 20 }
    )
    await expect(host.workspaceSwitched(notice('School'))).resolves.toMatchObject({
      status: 'failed',
      reason: 'Agent run timed out after 20ms'
    })
    await host.dispose()
  })

  it('never rejects when the runtime fails', async () => {
    const host = hostWith({
      id: 'fake',
      send: async () => {
        throw new Error('boom')
      }
    })
    await expect(host.workspaceSwitched(notice('School'))).resolves.toMatchObject({ status: 'failed', reason: 'boom' })
    await host.dispose()
  })
})
