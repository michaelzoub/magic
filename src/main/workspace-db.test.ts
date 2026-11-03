import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteWorkspaceStore } from './workspace-db'

let dir: string
let file: string

const ws = (id: string, name: string, description = '') => ({
  id, name, description, icon: 'layers', listed: false, lastSwitchedAt: null
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'magic-ws-db-'))
  file = join(dir, 'test.sqlite')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('SqliteWorkspaceStore', () => {
  it('returns null before anything is saved, then round-trips workspaces with descriptions', () => {
    const store = new SqliteWorkspaceStore(file)
    expect(store.loadSnapshot()).toBeNull()
    store.upsertWorkspace(ws('work', 'Work', 'Work projects and tools'))
    store.upsertWorkspace(ws('personal', 'Personal', 'Personal browsing'))
    const snap = store.loadSnapshot()!
    expect(snap.workspaces.map((w) => [w.id, w.description])).toEqual([
      ['work', 'Work projects and tools'],
      ['personal', 'Personal browsing']
    ])
    expect(snap.activeWorkspaceId).toBeNull()
    store.close()
  })

  it('updates in place on re-upsert instead of duplicating', () => {
    const store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('work', 'Work', 'old'))
    store.upsertWorkspace(ws('work', 'Work', 'new description'))
    expect(store.loadSnapshot()!.workspaces).toHaveLength(1)
    expect(store.loadSnapshot()!.workspaces[0]!.description).toBe('new description')
    store.close()
  })

  it('rejects duplicate names under a different id (unique name_key)', () => {
    const store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('w1', 'Work'))
    expect(() => store.upsertWorkspace(ws('w2', ' work '))).toThrow()
    store.close()
  })

  it('records every switch as before → after, marks the target active/listed, and persists across reopen', () => {
    let store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('personal', 'Personal'))
    store.upsertWorkspace(ws('work', 'Work'))
    store.recordSwitch({ fromWorkspaceId: null, toWorkspaceId: 'personal', switchedAt: 100 })
    store.recordSwitch({ fromWorkspaceId: 'personal', toWorkspaceId: 'work', switchedAt: 200 })
    store.recordSwitch({ fromWorkspaceId: 'work', toWorkspaceId: 'personal', switchedAt: 300 })

    expect(store.listSwitches()).toEqual([
      { id: 3, fromWorkspaceId: 'work', toWorkspaceId: 'personal', switchedAt: 300 },
      { id: 2, fromWorkspaceId: 'personal', toWorkspaceId: 'work', switchedAt: 200 },
      { id: 1, fromWorkspaceId: null, toWorkspaceId: 'personal', switchedAt: 100 }
    ])
    const snap = store.loadSnapshot()!
    expect(snap.activeWorkspaceId).toBe('personal')
    expect(snap.listedIds).toEqual(['personal', 'work'])
    expect(snap.workspaces.find((w) => w.id === 'personal')!.lastSwitchedAt).toBe(300)
    store.close()

    store = new SqliteWorkspaceStore(file)
    expect(store.loadSnapshot()!.switches).toHaveLength(3)
    expect(store.loadSnapshot()!.activeWorkspaceId).toBe('personal')
    store.close()
  })

  it('does not record a switch to the already-active workspace, and rejects unknown targets', () => {
    const store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('work', 'Work'))
    store.recordSwitch({ fromWorkspaceId: 'work', toWorkspaceId: 'work', switchedAt: 1 })
    expect(store.listSwitches()).toEqual([])
    expect(() => store.recordSwitch({ fromWorkspaceId: null, toWorkspaceId: 'nope', switchedAt: 1 })).toThrow(/No workspace/)
    store.close()
  })

  it('saves the outgoing workspace tabs with the switch and restores them on load', () => {
    const store = new SqliteWorkspaceStore(file)
    store.upsertWorkspace(ws('personal', 'Personal'))
    store.upsertWorkspace(ws('work', 'Work'))
    const tabs = {
      tabs: [
        { id: 't1', url: 'https://github.com/', title: 'GitHub' },
        { id: 't2', url: 'https://example.com/', title: 'Example', favicon: 'f.ico' }
      ],
      activeTabId: 't2'
    }
    store.recordSwitch({ fromWorkspaceId: null, toWorkspaceId: 'personal', switchedAt: 1 })
    store.recordSwitch({ fromWorkspaceId: 'personal', toWorkspaceId: 'work', switchedAt: 2, outgoingTabSet: tabs })
    expect(store.loadSnapshot()!.tabSets.personal).toEqual(tabs)

    store.saveTabSet('work', { tabs: [{ id: 't9', url: '', title: 'New Tab' }], activeTabId: 't9' })
    expect(store.loadSnapshot()!.tabSets.work).toEqual({ tabs: [{ id: 't9', url: '', title: 'New Tab' }], activeTabId: 't9' })
    expect(() => store.saveTabSet('nope', tabs)).toThrow(/No workspace/)
    store.close()
  })
})
