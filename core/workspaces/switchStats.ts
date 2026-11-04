import type { WorkspaceSwitchRecord } from '@shared/workspaces'

export interface WorkspaceSwitchStats {
  /** Switches since local midnight today. */
  today: number
  /** Switches in the last 7 calendar days, including today. */
  pastWeek: number
}

type SwitchLike = Pick<WorkspaceSwitchRecord, 'fromWorkspaceId' | 'toWorkspaceId' | 'switchedAt'>

/**
 * Count workspace switches for the new-tab stats. The first-ever activation
 * (`fromWorkspaceId: null`) is not a switch between modes, so it is excluded.
 */
export function workspaceSwitchStats(switches: readonly SwitchLike[], now = Date.now()): WorkspaceSwitchStats {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const todayStart = startOfToday.getTime()
  // Calendar arithmetic (not 6×24h) so DST transitions don't shift the window.
  const startOfWeekWindow = new Date(startOfToday)
  startOfWeekWindow.setDate(startOfWeekWindow.getDate() - 6)
  const weekStart = startOfWeekWindow.getTime()

  let today = 0
  let pastWeek = 0
  for (const s of switches) {
    if (!s.fromWorkspaceId || s.fromWorkspaceId === s.toWorkspaceId) continue
    if (s.switchedAt < weekStart || s.switchedAt > now) continue
    pastWeek++
    if (s.switchedAt >= todayStart) today++
  }
  return { today, pastWeek }
}
