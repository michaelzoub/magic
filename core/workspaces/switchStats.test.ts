import { describe, expect, it } from 'vitest'
import { workspaceSwitchStats } from './switchStats'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime()
const sw = (switchedAt: number, fromWorkspaceId: string | null = 'work', toWorkspaceId = 'personal') => ({
  fromWorkspaceId,
  toWorkspaceId,
  switchedAt
})

describe('workspaceSwitchStats', () => {
  const now = at(2026, 10, 3, 15) // Tue 3 Nov 2026, 15:00 local

  it('counts today and the past 7 calendar days (today included)', () => {
    const stats = workspaceSwitchStats(
      [
        sw(at(2026, 10, 3, 0)), // start of today
        sw(at(2026, 10, 3, 14)),
        sw(at(2026, 10, 2, 23)), // yesterday
        sw(at(2026, 9, 28, 0)), // 6 days ago: first day of the window
        sw(at(2026, 9, 27, 23)), // 7 days ago: outside the window
        sw(at(2026, 9, 1)) // long ago
      ],
      now
    )
    expect(stats).toEqual({ today: 2, pastWeek: 4 })
  })

  it('excludes the first-ever activation and same-workspace rows', () => {
    const stats = workspaceSwitchStats([sw(now, null, 'work'), sw(now, 'work', 'work'), sw(now)], now)
    expect(stats).toEqual({ today: 1, pastWeek: 1 })
  })

  it('ignores future timestamps and returns zeros with no history', () => {
    expect(workspaceSwitchStats([], now)).toEqual({ today: 0, pastWeek: 0 })
    expect(workspaceSwitchStats([sw(now + 60_000)], now)).toEqual({ today: 0, pastWeek: 0 })
  })
})
