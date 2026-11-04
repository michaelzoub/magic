import { describe, expect, it } from 'vitest'
import type { Checkpoint } from '@core/memory'
import { checkpointIcons, timeAgo } from './memoryCard'

const checkpoint = (beforeTitle: string, after: { workspaceId: string; title: string }): Checkpoint => ({
  id: 'c1',
  createdAt: 0,
  meaningful: true,
  before: { id: 'b1', title: beforeTitle, tabs: [], activeTabId: null, tags: [], createdAt: 0 },
  after: { id: after.workspaceId, workspaceId: after.workspaceId, title: after.title, tabs: [], activeTabId: null, tags: [], createdAt: 0 }
})

const workspaces = [
  { id: 'school', name: 'School', icon: 'graduation-cap' },
  { id: 'design', name: 'Design Inspo', icon: 'layers' }
]

describe('checkpointIcons', () => {
  it('resolves the saved workspace by name and the destination by workspace id', () => {
    expect(checkpointIcons(checkpoint('School', { workspaceId: 'design', title: 'Design Inspo' }), workspaces)).toEqual({
      beforeIcon: 'graduation-cap',
      afterIcon: 'layers'
    })
  })

  it('matches the saved workspace name case-insensitively', () => {
    expect(checkpointIcons(checkpoint(' school ', { workspaceId: 'design', title: 'Design Inspo' }), workspaces).beforeIcon).toBe('graduation-cap')
  })

  it('falls back to the destination name when its id is unknown', () => {
    expect(checkpointIcons(checkpoint('School', { workspaceId: 'gone', title: 'Design Inspo' }), workspaces).afterIcon).toBe('layers')
  })

  it('returns null for workspaces that no longer exist', () => {
    expect(checkpointIcons(checkpoint('Deleted', { workspaceId: 'gone', title: 'Also Gone' }), workspaces)).toEqual({
      beforeIcon: null,
      afterIcon: null
    })
  })
})

describe('timeAgo', () => {
  const now = 1_000_000_000_000
  const ago = (ms: number) => timeAgo(now - ms, now)

  it('reads "Just now" under a minute, including future timestamps', () => {
    expect(ago(30_000)).toEqual({ label: 'Just now', tone: 'fresh' })
    expect(timeAgo(now + 60_000, now).label).toBe('Just now')
  })

  it('formats minutes like the "30 mins ago" example', () => {
    expect(ago(60_000).label).toBe('1 min ago')
    expect(ago(30 * 60_000)).toEqual({ label: '30 mins ago', tone: 'fresh' })
  })

  it('rolls up to hours, days, and beyond with aging tones', () => {
    expect(ago(3 * 3_600_000)).toEqual({ label: '3 hrs ago', tone: 'recent' })
    expect(ago(2 * 86_400_000)).toEqual({ label: '2 days ago', tone: 'older' })
    expect(ago(21 * 86_400_000)).toEqual({ label: '3 wks ago', tone: 'old' })
    expect(ago(400 * 86_400_000).label).toBe('1 yr ago')
  })
})
