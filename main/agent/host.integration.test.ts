import { describe, expect, it, vi } from 'vitest'
import type { BrowserEngine, EngineSnapshot, TabState } from '@shared/engine'
import type { ElectronEngine } from '../browser/electron-engine'
import { EmbeddedAgentHost } from './host'

/**
 * Live end-to-end test: spawns the real Eve server (Electron-as-Node),
 * which calls the real Muse Spark model, whose browser tools call back
 * through the tool bridge into this fake engine.
 * Run with: MAGIC_AGENT_INTEGRATION=1 npx vitest run main/agent/host.integration.test.ts
 */
describe.skipIf(!process.env.MAGIC_AGENT_INTEGRATION)('EmbeddedAgentHost (live Eve + Muse Spark)', () => {
  it('runs the agent on a workspace switch and the agent can see live tabs via the bridge', async () => {
    const calls: string[] = []
    const tab: TabState = {
      id: 't1', url: 'https://example.com', title: 'Example', isLoading: false,
      canGoBack: false, canGoForward: false, isDiscarded: false
    }
    const fakeEngine = {
      getSnapshot: vi.fn(async (): Promise<EngineSnapshot> => {
        calls.push('getSnapshot')
        return { tabs: [tab], activeTabId: 't1' }
      }),
      createTab: vi.fn(async () => { calls.push('createTab'); return 't2' }),
      closeTab: vi.fn(async () => { calls.push('closeTab') }),
      activateTab: vi.fn(async () => {}),
      navigate: vi.fn(async () => { calls.push('navigate') }),
      goBack: vi.fn(async () => {}),
      goForward: vi.fn(async () => {}),
      subscribe: () => () => {},
      webContentsFor: () => undefined
    } as unknown as ElectronEngine

    const host = new EmbeddedAgentHost({
      appRoot: process.cwd(),
      engine: fakeEngine,
      log: (m) => console.log(m)
    })
    try {
      const result = await host.workspaceSwitched({
        from: { id: 'work', name: 'Work', goal: 'Get work projects done' },
        to: { id: 'school', name: 'School', goal: 'Finish coursework and research' },
        outgoingTabs: [{ title: 'Example', url: 'https://example.com' }],
        incomingTabs: [{ title: 'Example', url: 'https://example.com' }]
      })
      console.log('agent result:', result)
      expect(result.status).toBe('completed')
      // The agent was instructed to call list_tabs first; that only works
      // if Eve → bridge → this engine round-trips.
      expect(calls).toContain('getSnapshot')
    } finally {
      await host.dispose()
    }
  }, 240_000)
})
