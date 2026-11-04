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
    // Isolated assistance state per host, so toggle/exclusion tests cannot leak into each other.
    assistance: { active: true, excludedSites: [], excludedWorkspaceIds: [] },
    ...opts
  })
}

describe('EmbeddedAgentHost', () => {
  it('sends a before → after prompt through the runtime and returns its result', async () => {
    const send = vi.fn(async (_message: string) => ({ sessionId: 's1', reply: 'done', status: 'completed' as const }))
    const host = hostWith({ id: 'fake', send })
    const result = await host.workspaceSwitched(notice('School'))
    expect(result).toEqual({ status: 'completed', reply: 'done', runtime: 'fake', proposals: [], checkpointVerdict: null })
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0]).toContain('"Before"')
    expect(send.mock.calls[0][0]).toContain('"School"')
    await host.dispose()
  })

  it('surfaces the agent checkpoint verdict and strips it from the reply', async () => {
    const send = vi.fn(async (_message: string) => ({
      sessionId: 's1',
      reply: 'Set up School.\nCHECKPOINT_VERDICT: {"meaningful":true,"reason":"Left a coherent Work tab set behind"}',
      status: 'completed' as const
    }))
    const host = hostWith({ id: 'fake', send })
    const result = await host.workspaceSwitched(notice('School'))
    expect(result.reply).toBe('Set up School.')
    expect(result.checkpointVerdict).toEqual({ meaningful: true, reason: 'Left a coherent Work tab set behind' })
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

  it('does not run when background assistance is off', async () => {
    const send = vi.fn(async () => ({ sessionId: 's1', reply: 'done', status: 'completed' as const }))
    const host = hostWith({ id: 'fake', send })
    host.setAssistanceActive(false)
    await expect(host.workspaceSwitched(notice('School'))).resolves.toMatchObject({ status: 'skipped', reason: 'Background assistance is off' })
    expect(send).not.toHaveBeenCalled()
    expect(host.listAssistanceActivity(1)[0]).toMatchObject({ status: 'skipped' })
    await host.dispose()
  })

  it('does not run for an excluded workspace', async () => {
    const send = vi.fn(async () => ({ sessionId: 's1', reply: 'done', status: 'completed' as const }))
    const host = hostWith({ id: 'fake', send })
    host.setAssistanceExclusions([], ['b'])
    await expect(host.workspaceSwitched(notice('School'))).resolves.toMatchObject({ status: 'skipped' })
    expect(send).not.toHaveBeenCalled()
    await host.dispose()
  })

  it('hides excluded sites from the agent prompt', async () => {
    const send = vi.fn(async (_message: string) => ({ sessionId: 's1', reply: 'done', status: 'completed' as const }))
    const host = hostWith({ id: 'fake', send })
    host.setAssistanceExclusions(['youtube.com'], [])
    await host.workspaceSwitched({
      ...notice('School'),
      outgoingTabs: [
        { title: 'Video', url: 'https://www.youtube.com/watch?v=1' },
        { title: 'Docs', url: 'https://example.com/docs' }
      ]
    })
    expect(send.mock.calls[0][0]).not.toContain('youtube.com')
    expect(send.mock.calls[0][0]).toContain('example.com')
    await host.dispose()
  })

  it('ask sends the question + context through the runtime and returns the reply', async () => {
    const send = vi.fn(async (_message: string) => ({ sessionId: 's1', reply: 'Opened it.', status: 'completed' as const }))
    const host = hostWith({ id: 'fake', send })
    const result = await host.ask('Open example.com', {
      workspace: { id: 'b', name: 'School', goal: 'new goal' },
      tabs: [{ title: 'Docs', url: 'https://example.com/docs' }]
    })
    expect(result).toEqual({ status: 'completed', reply: 'Opened it.', runtime: 'fake', sessionId: 's1', checkpointVerdict: null })
    expect(send.mock.calls[0][0]).toContain('User question: Open example.com')
    expect(send.mock.calls[0][0]).toContain('"School"')
    await host.dispose()
  })

  it('ask continues the same session on follow-ups and runs even when background assistance is off', async () => {
    const send = vi.fn(async (_message: string, opts?: { sessionId?: string }) => ({
      sessionId: opts?.sessionId ?? 's9',
      reply: 'ok',
      status: 'completed' as const
    }))
    const host = hostWith({ id: 'fake', send })
    host.setAssistanceActive(false)
    await host.ask('First', { workspace: null, tabs: [] })
    await host.ask('Second', { workspace: null, tabs: [] })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][1]).toMatchObject({ sessionId: 's9' })
    await host.dispose()
  })

  it('ask hides excluded sites from the prompt and never rejects on failure', async () => {
    const send = vi.fn(async (_message: string) => {
      throw new Error('boom')
    })
    const host = hostWith({ id: 'fake', send })
    host.setAssistanceExclusions(['youtube.com'], [])
    await expect(
      host.ask('What is open?', {
        workspace: null,
        tabs: [
          { title: 'Video', url: 'https://www.youtube.com/watch?v=1' },
          { title: 'Docs', url: 'https://example.com/docs' }
        ]
      })
    ).resolves.toMatchObject({ status: 'failed', reason: 'boom' })
    expect(send.mock.calls[0][0]).not.toContain('youtube.com')
    expect(send.mock.calls[0][0]).toContain('example.com')
    await host.dispose()
  })

  it('ask forwards stream events when the runtime supports streaming', async () => {
    const events: unknown[] = []
    const host = hostWith({
      id: 'fake',
      send: async () => {
        throw new Error('send should not be used when streaming is available')
      },
      sendStream: async (_message, opts) => {
        opts?.onEvent({ type: 'text-delta', text: 'Opening…' })
        opts?.onEvent({ type: 'tool-call', id: 'c1', name: 'open_tab' })
        opts?.onEvent({ type: 'tool-result', id: 'c1', name: 'open_tab', outcome: 'completed' })
        return { sessionId: 's1', reply: 'Opened.', status: 'completed' as const }
      }
    })
    const result = await host.ask('open youtube', { workspace: null, tabs: [] }, (e) => events.push(e))
    expect(result.reply).toBe('Opened.')
    expect(events).toEqual([
      { type: 'text-delta', text: 'Opening…' },
      { type: 'tool-call', id: 'c1', name: 'open_tab' },
      { type: 'tool-result', id: 'c1', name: 'open_tab', outcome: 'completed' }
    ])
    await host.dispose()
  })

  it('streams switch-run events to the listener and returns staged proposals', async () => {
    const events: unknown[] = []
    const host = hostWith({
      id: 'fake',
      send: async () => {
        throw new Error('send should not be used when streaming is available')
      },
      sendStream: async (_message, opts) => {
        opts?.onEvent({ type: 'tool-call', id: 'c1', name: 'open_tab', input: { url: 'https://example.com' } })
        opts?.onEvent({ type: 'tool-result', id: 'c1', name: 'open_tab', outcome: 'completed' })
        return { sessionId: 's1', reply: 'Proposed changes.', status: 'completed' as const }
      }
    })
    const result = await host.workspaceSwitched(notice('School'), (e) => events.push(e))
    expect(result).toMatchObject({ status: 'completed', reply: 'Proposed changes.', proposals: [] })
    expect(events).toHaveLength(2)
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
