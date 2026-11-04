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

  it('resolves window.agent at call time, so a bridge installed after import is used', async () => {
    const ask = vi.fn(async () => ({ sessionId: 's1', reply: 'done', status: 'completed' as const }))
    ;(window as { agent?: unknown }).agent = { ask }
    await expect(embeddedAgent.ask('hi', { workspace: null, tabs: [] })).resolves.toMatchObject({ reply: 'done' })
    expect(ask).toHaveBeenCalledOnce()
  })
})
