import { describe, expect, it, vi } from 'vitest'
import { BrowserController } from './controller'
import { createBrowserState, type BrowserState } from './state'
import { BrowserStore, type BrowserStorage } from './store'

function state(): BrowserState {
  return createBrowserState()
}

describe('BrowserState', () => {
  it('starts empty with no active workspace', () => {
    expect(state()).toEqual({ workspaces: [], activeWorkspaceId: null, assignments: [] })
  })

  it('normalizes initial state so invariants hold', () => {
    const s = createBrowserState({
      workspaces: [
        { id: 'w1', name: 'A', sites: new Map() },
        { id: 'w2', name: 'B', sites: new Map() }
      ],
      activeWorkspaceId: 'missing',
      assignments: [
        { tabId: 't1', workspaceId: 'w1' },
        { tabId: 't2', workspaceId: 'missing' }
      ]
    })
    expect(s.activeWorkspaceId).toBe('w1')
    expect(s.assignments).toEqual([{ tabId: 't1', workspaceId: 'w1' }])
  })
})

describe('BrowserController', () => {
  it('creates workspaces; the first becomes active', () => {
    const c = new BrowserController(state())
    const w1 = c.create({ name: 'Work' })
    expect(w1.id).toBeTruthy()
    expect(c.getActive()?.id).toBe(w1.id)
    const w2 = c.create({ id: 'w2', name: 'Home' })
    expect(w2.id).toBe('w2')
    expect(c.getActive()?.id).toBe(w1.id)
    expect(c.list().map((w) => w.name)).toEqual(['Work', 'Home'])
  })

  it('rejects blank, duplicate, and duplicate-id workspaces', () => {
    const c = new BrowserController(state())
    c.create({ id: 'w1', name: 'Work' })
    expect(() => c.create({ name: '  ' })).toThrow()
    expect(() => c.create({ name: ' work ' })).toThrow()
    expect(() => c.create({ id: 'w1', name: 'Other' })).toThrow()
  })

  it('switches the active workspace and rejects unknown ids', () => {
    const c = new BrowserController(state())
    c.create({ id: 'w1', name: 'A' })
    c.create({ id: 'w2', name: 'B' })
    c.switchTo('w2')
    expect(c.getActive()?.id).toBe('w2')
    expect(() => c.switchTo('nope')).toThrow()
  })

  it('assigns, moves, and unassigns tabs without touching probabilities', () => {
    const c = new BrowserController(state())
    c.create({ id: 'w1', name: 'A' })
    c.create({ id: 'w2', name: 'B' })
    c.setSite('w1', 'github.com', 0.8)
    c.assign('t1', 'w1')
    expect(c.getWorkspaceForTab('t1')).toBe('w1')
    expect(c.listTabs('w1')).toEqual(['t1'])
    c.assign('t1', 'w2')
    expect(c.listTabs('w1')).toEqual([])
    expect(c.listTabs('w2')).toEqual(['t1'])
    expect(c.getSite('w1', 'github.com')).toBe(0.8)
    c.unassign('t1')
    expect(c.getWorkspaceForTab('t1')).toBeNull()
    c.unassign('t1')
    expect(() => c.assign('', 'w1')).toThrow()
    expect(() => c.assign('t2', 'nope')).toThrow()
    expect(() => c.listTabs('nope')).toThrow()
  })

  it('tracks site probabilities and matches across workspaces', () => {
    const c = new BrowserController(state())
    c.create({ id: 'w1', name: 'A' })
    c.create({ id: 'w2', name: 'B' })
    expect(c.getSite('w1', 'github.com')).toBe(0)
    c.setSite('w1', 'github.com', 0.4)
    c.setSite('w2', 'github.com', 0.9)
    expect(c.matchSite('github.com')).toEqual([
      { workspaceId: 'w2', probability: 0.9 },
      { workspaceId: 'w1', probability: 0.4 }
    ])
    c.removeSite('w2', 'github.com')
    expect(c.matchSite('github.com')).toEqual([{ workspaceId: 'w1', probability: 0.4 }])
    expect(() => c.setSite('w1', 'x.com', -0.1)).toThrow()
    expect(() => c.setSite('w1', 'x.com', 1.1)).toThrow()
    expect(() => c.setSite('w1', 'x.com', Number.NaN)).toThrow()
    expect(() => c.getSite('nope', 'x.com')).toThrow()
  })
})

describe('BrowserStore', () => {
  it('notifies subscribers on mutation only', () => {
    const store = new BrowserStore()
    const seen: Array<string | null> = []
    const unsub = store.subscribe((s) => seen.push(s.activeWorkspaceId))
    store.create({ id: 'w1', name: 'A' })
    store.list()
    store.get('w1')
    expect(seen).toEqual(['w1'])
    unsub()
    store.create({ id: 'w2', name: 'B' })
    expect(seen).toEqual(['w1'])
  })

  it('persists a snapshot on every mutation', () => {
    const saves: BrowserState[] = []
    const storage: BrowserStorage = {
      load: () => null,
      save: (s) => {
        saves.push(s)
      }
    }
    const store = new BrowserStore({ storage })
    store.create({ id: 'w1', name: 'A' })
    store.assign('t1', 'w1')
    expect(saves.length).toBe(2)
    expect(saves[0]!.assignments).toEqual([])
    expect(saves[1]!.assignments).toEqual([{ tabId: 't1', workspaceId: 'w1' }])
    expect(saves[0]!.workspaces[0]!.sites).toBeInstanceOf(Map)
  })

  it('survives storage failures', () => {
    const store = new BrowserStore({
      storage: {
        load: () => null,
        save: () => {
          throw new Error('disk full')
        }
      }
    })
    expect(() => store.create({ name: 'A' })).not.toThrow()
    expect(store.list().length).toBe(1)
  })

  it('rehydrates from storage', async () => {
    const saved = createBrowserState()
    new BrowserController(saved).create({ id: 'w1', name: 'A' })
    const storage: BrowserStorage = { load: async () => saved, save: vi.fn() }
    const store = await BrowserStore.load(storage)
    expect(store.getState().activeWorkspaceId).toBe('w1')
    expect(store.list().map((w) => w.name)).toEqual(['A'])
  })

  it('falls back when storage is empty', async () => {
    const storage: BrowserStorage = { load: () => null, save: () => {} }
    expect((await BrowserStore.load(storage)).getState()).toEqual(createBrowserState())
  })
})
