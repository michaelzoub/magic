import { afterEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', {})

const { embeddedAgent } = await import('./agent')

afterEach(() => {
  ;(window as { agent?: unknown }).agent = undefined
})

describe('embeddedAgent adapter', () => {
  it('ask degrades to skipped (not "is not a function") when the bridge lacks ask', async () => {
    // Stale preload shape: bridge exists but predates the ask method.
    ;(window as { agent?: unknown }).agent = { workspaceSwitched: async () => ({ status: 'skipped', reply: null }) }
    await expect(embeddedAgent.ask('open youtube', { workspace: null, tabs: [] })).resolves.toMatchObject({
      status: 'skipped',
      reply: null
    })
  })

  it('forwards the stream listener to the bridge ask, so tool events reach the shell', async () => {
    const onEvent = vi.fn()
    const ask = vi.fn(async (_q: string, _c: unknown, listener?: (e: unknown) => void) => {
      listener?.({ type: 'tool-call', id: '1', name: 'navigate', input: { url: 'https://example.com' } })
      return { reply: 'done', status: 'completed' as const }
    })
    ;(window as { agent?: unknown }).agent = { ask }
    await embeddedAgent.ask('go', { workspace: null, tabs: [] }, onEvent)
    expect(ask).toHaveBeenCalledWith('go', { workspace: null, tabs: [] }, onEvent)
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'tool-call', name: 'navigate' }))
  })

  it('resolves window.agent at call time, so a bridge installed after import is used', async () => {
    const ask = vi.fn(async () => ({ sessionId: 's1', reply: 'done', status: 'completed' as const }))
    ;(window as { agent?: unknown }).agent = { ask }
    await expect(embeddedAgent.ask('hi', { workspace: null, tabs: [] })).resolves.toMatchObject({ reply: 'done' })
    expect(ask).toHaveBeenCalledOnce()
  })
})
