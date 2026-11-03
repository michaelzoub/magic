import { describe, expect, it } from 'vitest'
import { createMemoryEngine } from './memory-engine'

describe('memory engine moveTab', () => {
  it('reorders tabs, clamps the target index, and ignores unknown ids', async () => {
    const engine = createMemoryEngine()
    const a = (await engine.getSnapshot()).activeTabId!
    const b = await engine.createTab()
    const c = await engine.createTab()
    const ids = async () => (await engine.getSnapshot()).tabs.map((t) => t.id)

    await engine.moveTab(a, 2)
    expect(await ids()).toEqual([b, c, a])

    await engine.moveTab(a, -10)
    expect(await ids()).toEqual([a, b, c])

    await engine.moveTab(b, 99)
    expect(await ids()).toEqual([a, c, b])

    await engine.moveTab('missing', 0)
    expect(await ids()).toEqual([a, c, b])
  })
})
