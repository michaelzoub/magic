import { describe, expect, it, vi } from 'vitest'
import { WorkspaceSwitchboard, type SwitchableWorkspace } from './switchboard'

const seed = () =>
  new WorkspaceSwitchboard<SwitchableWorkspace>([
    { id: 'personal', name: 'Personal' },
    { id: 'work', name: 'Work' },
    { id: 'school', name: 'School' }
  ])

describe('WorkspaceSwitchboard.switchTo — the only gate for switching', () => {
  it('adds the switched-to workspace to the listed array and activates it', () => {
    const board = seed()
    expect(board.listedIds).toEqual([])
    expect(board.activeId).toBeNull()
    board.switchTo('work')
    expect(board.listedIds).toEqual(['work'])
    expect(board.listedWorkspaces.map((w) => w.name)).toEqual(['Work'])
    expect(board.activeId).toBe('work')
    expect(board.getActive()?.name).toBe('Work')
  })

  it('never duplicates, preserves first-switch order, and rejects unknown ids', () => {
    const board = seed()
    board.switchTo('school')
    board.switchTo('work')
    board.switchTo('school')
    expect(board.listedIds).toEqual(['school', 'work'])
    expect(board.activeId).toBe('school')
    expect(() => board.switchTo('nope')).toThrow(/No workspace/)
    expect(board.listedIds).toEqual(['school', 'work'])
  })

  it('notifies subscribers on switch', () => {
    const board = seed()
    const seen = vi.fn()
    const off = board.subscribe(seen)
    board.switchTo('work')
    off()
    board.switchTo('school')
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('WorkspaceSwitchboard.switchTo — respective tabs become the open tabs', () => {
  const tab = (id: string) => ({ id, title: id, url: `https://${id}.example/` })

  it('returns the target workspace tabs as the exact replacement for the current array', () => {
    const board = new WorkspaceSwitchboard([
      { id: 'personal', name: 'Personal', tabs: [tab('p1'), tab('p2')], activeTabId: 'p2' },
      { id: 'work', name: 'Work', tabs: [tab('w1')], activeTabId: 'w1' }
    ])
    board.switchTo('personal')
    const { workspace, replaceTabs } = board.switchTo('work', { tabs: [tab('p1-live'), tab('p9')], activeTabId: 'p9' })
    expect(workspace.id).toBe('work')
    // Never a merge: every live tab closes, the open array becomes exactly Work's.
    expect(replaceTabs.closeTabIds).toEqual(['p1-live', 'p9'])
    expect(replaceTabs.tabs).toEqual([tab('w1')])
    expect(replaceTabs.activeTabId).toBe('w1')
  })

  it('saves the outgoing tabs and restores them on switch-back, per workspace', () => {
    const board = seed()
    board.switchTo('work')
    board.switchTo('school', { tabs: [tab('w-live')], activeTabId: 'w-live' })
    expect(board.getTabSet('work')).toEqual({ tabs: [tab('w-live')], activeTabId: 'w-live' })
    expect(board.getTabSet('school')).toEqual({ tabs: [], activeTabId: null })

    const back = board.switchTo('work', { tabs: [tab('s-live')], activeTabId: 's-live' })
    expect(back.replaceTabs.tabs).toEqual([tab('w-live')])
    expect(back.replaceTabs.activeTabId).toBe('w-live')
    const forth = board.switchTo('school', { tabs: [tab('w-live-2')], activeTabId: 'w-live-2' })
    expect(forth.replaceTabs.tabs).toEqual([tab('s-live')])
    expect(board.getTabSet('work').tabs).toEqual([tab('w-live-2')])
  })

  it('a failed switch saves nothing and leaves the active workspace and its tabs untouched', () => {
    const board = seed()
    board.switchTo('work')
    expect(() => board.switchTo('nope', { tabs: [tab('orphan')], activeTabId: 'orphan' })).toThrow(/No workspace/)
    expect(board.getTabSet('work')).toEqual({ tabs: [], activeTabId: null })
    expect(board.activeId).toBe('work')
  })

  it('a newly created workspace starts with no tabs; the outgoing tabs are kept for switch-back', () => {
    const board = seed()
    board.switchTo('work')
    const created = board.addAndSwitch({ id: 'code', name: 'Code' }, { tabs: [tab('w1')], activeTabId: 'w1' })
    expect(created.replaceTabs).toEqual({ closeTabIds: ['w1'], tabs: [], activeTabId: null })
    expect(board.switchTo('work', { tabs: [], activeTabId: null }).replaceTabs.tabs).toEqual([tab('w1')])
  })

  it('ensureAndSwitch makes the carried tabs the focus mode\u2019s current tabs', () => {
    const board = seed()
    board.switchTo('work')
    const { replaceTabs } = board.ensureAndSwitch(
      { id: 'code-focus', name: 'Code Focus Mode', tabs: [tab('gh'), tab('docs')], activeTabId: 'docs' },
      { tabs: [tab('w1')], activeTabId: 'w1' }
    )
    expect(replaceTabs).toEqual({ closeTabIds: ['w1'], tabs: [tab('gh'), tab('docs')], activeTabId: 'docs' })
    expect(board.getTabSet('work').tabs).toEqual([tab('w1')])
  })
})

describe('WorkspaceSwitchboard.hydrate — restoring persisted state', () => {
  it('restores listed order and the active workspace without recording a switch', () => {
    const board = seed()
    board.hydrate(['school', 'work'], 'work')
    expect(board.listedIds).toEqual(['school', 'work'])
    expect(board.activeId).toBe('work')
  })

  it('drops unknown ids, dedupes, and lists the active workspace', () => {
    const board = seed()
    board.hydrate(['nope', 'work', 'work'], 'school')
    expect(board.listedIds).toEqual(['work', 'school'])
    expect(board.activeId).toBe('school')
    board.hydrate([], 'nope')
    expect(board.listedIds).toEqual([])
    expect(board.activeId).toBeNull()
  })
})

describe('WorkspaceSwitchboard creation / external switches', () => {
  it('addAndSwitch registers, lists, and activates the new workspace', () => {
    const board = seed()
    board.addAndSwitch({ id: 'code', name: 'Code Focus Mode' })
    expect(board.workspaces.map((w) => w.id)).toContain('code')
    expect(board.listedIds).toEqual(['code'])
    expect(board.activeId).toBe('code')
    expect(() => board.addAndSwitch({ id: 'x', name: ' code focus mode ' })).toThrow(/already exists/)
    expect(() => board.addAndSwitch({ id: 'code', name: 'Other' })).toThrow(/already exists/)
    expect(() => board.addAndSwitch({ id: 'y', name: '  ' })).toThrow(/name is required/)
  })

  it('ensureAndSwitch registers an unknown focus mode and still passes through the gate', () => {
    const board = seed()
    board.switchTo('work')
    board.ensureAndSwitch({ id: 'code-focus', name: 'Code Focus Mode' })
    expect(board.listedIds).toEqual(['work', 'code-focus'])
    expect(board.activeId).toBe('code-focus')
    // Second time: no duplicate registration or listing.
    board.ensureAndSwitch({ id: 'code-focus', name: 'Code Focus Mode' })
    expect(board.listedIds).toEqual(['work', 'code-focus'])
    expect(board.workspaces.filter((w) => w.id === 'code-focus')).toHaveLength(1)
  })
})
