import { describe, expect, it } from 'vitest'
import type { TabState } from '@shared/engine'
import { diffTabs } from './tabFeedback'

const tab = (id: string, url = `https://${id}.example`): TabState => ({
  id, url, title: id, isLoading: false, canGoBack: false, canGoForward: false, isDiscarded: false
})

describe('diffTabs', () => {
  it('reports a single added tab', () => {
    const a = tab('a')
    const b = tab('b')
    const { operations, bulk } = diffTabs([a], [a, b], 'a', 'b')
    expect(bulk).toBe(false)
    expect(operations).toEqual([{ kind: 'added', tab: b, index: 1 }])
  })

  it('reports a single removed tab with its previous index', () => {
    const a = tab('a')
    const b = tab('b')
    const { operations } = diffTabs([a, b], [a], 'a', 'a')
    expect(operations).toEqual([{ kind: 'removed', tab: b, index: 1 }])
  })

  it('reports activation of an existing tab as reuse, without recreating it', () => {
    const a = tab('a')
    const b = tab('b')
    const { operations } = diffTabs([a, b], [a, b], 'a', 'b')
    expect(operations).toEqual([{ kind: 'reused', tab: b, index: 1 }])
  })

  it('reports navigation of an existing tab as reuse', () => {
    const a = tab('a')
    const moved = { ...a, url: 'https://elsewhere.example' }
    const { operations } = diffTabs([a], [moved], 'a', 'a')
    expect(operations).toEqual([{ kind: 'reused', tab: moved, index: 0 }])
  })

  it('treats a workspace-style wholesale replacement as bulk, not individual ops', () => {
    const prev = [tab('a'), tab('b')]
    const next = [tab('c'), tab('d'), tab('e')]
    const { operations, bulk } = diffTabs(prev, next, 'a', 'd')
    expect(bulk).toBe(true)
    expect(operations).toEqual([])
  })

  it('treats a multi-tab startup restore as bulk', () => {
    const { operations, bulk } = diffTabs([], [tab('a'), tab('b')], null, 'a')
    expect(bulk).toBe(true)
    expect(operations).toEqual([])
  })

  it('reports nothing when the snapshot is unchanged', () => {
    const tabs = [tab('a'), tab('b')]
    expect(diffTabs(tabs, tabs, 'a', 'a')).toEqual({ operations: [], bulk: false })
  })
})
