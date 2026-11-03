import { describe, expect, it } from 'vitest'
import { BrowserController } from '../workspaces/controller'
import { createBrowserState } from '../workspaces/state'
import {
  createMemoryState,
  getTransitionTarget,
  listCheckpoints,
  planWorkspaceSwitch,
  recordReorg,
  restoreCheckpoint
} from './state'
import type { RecordReorgInput, SavedTab } from './types'

const tab = (id: string, title: string, url: string): SavedTab => ({ id, title, url })

const beforeTabs = [
  tab('t1', 'Lo-fi beats', 'https://youtube.com/watch?v=1'),
  tab('t2', 'Algebra homework', 'https://classroom.google.com/'),
  tab('t3', 'some repo', 'https://github.com/a/b')
]
const codeTabs = [tab('t3', 'some repo', 'https://github.com/a/b'), tab('t4', 'TS docs', 'https://typescriptlang.org/docs')]

const reorg = (over: Partial<RecordReorgInput> = {}): RecordReorgInput => ({
  beforeTabs,
  beforeActiveTabId: 't2',
  beforeTitle: 'Music, school & code mix',
  after: { workspaceId: 'code-focus', title: 'Code Focus Mode', tabs: codeTabs, activeTabId: 't3' },
  checkpointId: 'c1',
  beforeId: 'before-1',
  createdAt: 1000,
  ...over
})

describe('recordReorg', () => {
  it('saves the Before, the before→after id map, and the workspace to activate', () => {
    const { state, transition } = recordReorg(createMemoryState(), reorg())
    expect(transition.checkpoint.before).toMatchObject({ id: 'before-1', title: 'Music, school & code mix' })
    expect(transition.checkpoint.before.tabs).toEqual(beforeTabs)
    expect(transition.checkpoint.before.activeTabId).toBe('t2')
    expect(transition.checkpoint.before.tags).toEqual(['Lo-fi beats', 'Algebra homework', 'some repo'])
    expect(transition).toMatchObject({ fromSnapshotId: 'before-1', toWorkspaceId: 'code-focus', setActiveWorkspaceId: 'code-focus' })
    // Switching clears the current (Before) array and replaces it with the After tabs.
    expect(transition.replaceTabs.closeTabIds).toEqual(['t1', 't2', 't3'])
    expect(transition.replaceTabs.tabs).toEqual(codeTabs)
    expect(transition.replaceTabs.activeTabId).toBe('t3')
    expect(getTransitionTarget(state, 'before-1')).toBe('code-focus')
    // The map target is fetchable from the workspace table and becomes active.
    const browser = createBrowserState()
    const controller = new BrowserController(browser)
    controller.create({ id: 'code-focus', name: 'Code Focus Mode', goal: '' })
    controller.switchTo(getTransitionTarget(state, 'before-1')!)
    expect(browser.activeWorkspaceId).toBe('code-focus')
    expect(controller.get('code-focus')?.name).toBe('Code Focus Mode')
  })

  it('reuses the After id/title per focus mode while every Before stays unique', () => {
    const first = recordReorg(createMemoryState(), reorg())
    const second = recordReorg(first.state, reorg({ checkpointId: 'c2', beforeId: 'before-2', beforeTitle: 'Another mix' }))
    expect(second.state.checkpoints.map((c) => c.after.id)).toEqual(['code-focus', 'code-focus'])
    expect(second.state.checkpoints.map((c) => c.before.id)).toEqual(['before-1', 'before-2'])
    expect(listCheckpoints(second.state).map((c) => c.id)).toEqual(['c2', 'c1'])
    expect(() => recordReorg(second.state, reorg({ checkpointId: 'c3' }))).toThrow(/Before snapshot id/)
    expect(() => recordReorg(second.state, reorg({ beforeId: 'before-3' }))).toThrow(/Checkpoint id/)
  })

  it('generates fresh ids when none are supplied', () => {
    const { checkpointId: _c, beforeId: _b, ...input } = reorg()
    const a = recordReorg(createMemoryState(), input)
    const b = recordReorg(a.state, input)
    expect(a.transition.checkpoint.before.id).not.toBe(b.transition.checkpoint.before.id)
    expect(a.transition.checkpoint.id).not.toBe(b.transition.checkpoint.id)
  })

  it('does not mutate the input state', () => {
    const empty = createMemoryState()
    recordReorg(empty, reorg())
    expect(empty).toEqual({ checkpoints: [], transitions: new Map(), restoredCheckpointId: null })
  })
})

describe('restoreCheckpoint', () => {
  it('clears the current tab array and replaces it with the Before tabs', () => {
    const { state } = recordReorg(createMemoryState(), reorg())
    // Live array is the focus mode's tabs; t3 is in both, and is still closed + reopened.
    const restored = restoreCheckpoint(state, 'c1', codeTabs)
    expect(restored.transition.replaceTabs.closeTabIds).toEqual(['t3', 't4'])
    expect(restored.transition.replaceTabs.tabs).toEqual(beforeTabs)
    expect(restored.transition.replaceTabs.activeTabId).toBe('t2')
    expect(restored.transition.fromWorkspaceId).toBe('code-focus')
    expect(restored.state.restoredCheckpointId).toBe('c1')
    // A new reorg supersedes the restore.
    expect(recordReorg(restored.state, reorg({ checkpointId: 'c2', beforeId: 'b2' })).state.restoredCheckpointId).toBeNull()
    expect(() => restoreCheckpoint(state, 'nope')).toThrow(/No checkpoint/)
  })
})

describe('planWorkspaceSwitch', () => {
  it('never merges: the resulting array is exactly the target, all current ids closed', () => {
    const { state } = recordReorg(createMemoryState(), reorg())
    const target = state.checkpoints[0]!.after
    const plan = planWorkspaceSwitch([{ id: 'x' }, { id: 't3' }], target)
    expect(plan.closeTabIds).toEqual(['x', 't3'])
    expect(plan.tabs.map((t) => t.id)).toEqual(['t3', 't4'])
    expect(plan.activeTabId).toBe('t3')
  })
})

describe('createMemoryState', () => {
  it('rebuilds the transition map from checkpoints and drops dangling restores', () => {
    const { state } = recordReorg(createMemoryState(), reorg())
    const normalized = createMemoryState({ checkpoints: state.checkpoints, restoredCheckpointId: 'gone' })
    expect(normalized.transitions).toEqual(new Map([['before-1', 'code-focus']]))
    expect(normalized.restoredCheckpointId).toBeNull()
  })
})
