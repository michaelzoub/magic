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

describe('WorkspaceSwitchboard.remove — deleting workspaces', () => {
  const tab = (id: string) => ({ id, title: id, url: `https://${id}.example/` })

  it('removes a non-active workspace and its saved tabs without touching the open tabs', () => {
    const board = seed()
    board.switchTo('work')
    board.switchTo('school', { tabs: [tab('w-live')], activeTabId: 'w-live' })
    const result = board.remove('work')
    expect(result).toEqual({ workspace: null, replaceTabs: null })
    expect(board.workspaces.map((w) => w.id)).toEqual(['personal', 'school'])
    expect(board.listedIds).toEqual(['school'])
    expect(board.activeId).toBe('school')
    expect(() => board.getTabSet('work')).toThrow(/No workspace/)
  })

  it('deleting the active workspace lands on the first listed fallback with its tabs', () => {
    const board = new WorkspaceSwitchboard([
      { id: 'personal', name: 'Personal', tabs: [tab('p1')], activeTabId: 'p1' },
      { id: 'work', name: 'Work', tabs: [tab('w1')], activeTabId: 'w1' },
      { id: 'school', name: 'School' }
    ])
    board.switchTo('personal')
    board.switchTo('work')
    const { workspace, replaceTabs } = board.remove('work', { tabs: [tab('w-live')], activeTabId: 'w-live' })
    expect(workspace?.id).toBe('personal')
    expect(board.activeId).toBe('personal')
    expect(board.listedIds).toEqual(['personal'])
    // The deleted workspace's live tabs are discarded, not saved anywhere.
    expect(replaceTabs).toEqual({ closeTabIds: ['w-live'], tabs: [tab('p1')], activeTabId: 'p1' })
  })

  it('deleting the last workspace leaves none active and closes every open tab', () => {
    const board = new WorkspaceSwitchboard([{ id: 'solo', name: 'Solo' }])
    board.switchTo('solo')
    const { workspace, replaceTabs } = board.remove('solo', { tabs: [tab('s1')], activeTabId: 's1' })
    expect(workspace).toBeNull()
    expect(replaceTabs).toEqual({ closeTabIds: ['s1'], tabs: [], activeTabId: null })
    expect(board.activeId).toBeNull()
    expect(board.workspaces).toEqual([])
  })

  it('rejects unknown ids and changes nothing', () => {
    const board = seed()
    board.switchTo('work')
    expect(() => board.remove('nope')).toThrow(/No workspace/)
    expect(board.activeId).toBe('work')
    expect(board.workspaces).toHaveLength(3)
  })
})

describe('WorkspaceSwitchboard.deactivate — quitting to non-set', () => {
  const tab = (id: string) => ({ id, title: id, url: `https://${id}.example/` })

  it('saves live tabs, clears the active workspace, and keeps it listed', () => {
    const board = seed()
    board.switchTo('work')
    expect(board.deactivate({ tabs: [tab('w-live')], activeTabId: 'w-live' })).toBe('work')
    expect(board.activeId).toBeNull()
    expect(board.getActive()).toBeNull()
    expect(board.listedIds).toEqual(['work'])
    expect(board.getTabSet('work')).toEqual({ tabs: [tab('w-live')], activeTabId: 'w-live' })
    // Switching back restores exactly the tabs saved at quit time.
    expect(board.switchTo('work').replaceTabs.tabs).toEqual([tab('w-live')])
  })

  it('is a no-op (and does not notify) when no workspace is active', () => {
    const board = seed()
    const seen = vi.fn()
    board.subscribe(seen)
    expect(board.deactivate()).toBeNull()
    expect(board.activeId).toBeNull()
    expect(seen).not.toHaveBeenCalled()
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
