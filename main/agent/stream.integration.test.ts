import { describe, expect, it, vi } from 'vitest'
import type { EngineSnapshot, TabState } from '@shared/engine'
import type { ElectronEngine } from '../browser/electron-engine'
import { EmbeddedAgentHost } from './host'

describe.skipIf(!process.env.MAGIC_AGENT_INTEGRATION)('streaming ask (live)', () => {
  it('streams text and tool-call events', async () => {
    const tab: TabState = {
      id: 't1', url: 'https://example.com', title: 'Example', isLoading: false,
      canGoBack: false, canGoForward: false, isDiscarded: false
    }
    const fakeEngine = {
      getSnapshot: vi.fn(async (): Promise<EngineSnapshot> => ({ tabs: [tab], activeTabId: 't1' })),
      createTab: vi.fn(async () => 't2'),
      closeTab: vi.fn(async () => {}),
      activateTab: vi.fn(async () => {}),
      navigate: vi.fn(async () => {}),
      goBack: vi.fn(async () => {}),
      goForward: vi.fn(async () => {}),
      subscribe: () => () => {},
      webContentsFor: () => undefined
    } as unknown as ElectronEngine
    const host = new EmbeddedAgentHost({ appRoot: process.cwd(), engine: fakeEngine, log: (m) => console.log(m) })
    const events: unknown[] = []
    try {
      const result = await host.ask('What tabs are open? Check with your tools, then answer.', { workspace: null, tabs: [] }, (e) => {
        events.push(e)
        console.log('STREAM EVENT', JSON.stringify(e).slice(0, 200))
      })
      console.log('result', result.status, JSON.stringify(result.reply)?.slice(0, 200), 'events:', events.length)
      expect(result.status).toBe('completed')
      expect(events.length).toBeGreaterThan(0)
    } finally {
      await host.dispose()
    }
  }, 240_000)
})
