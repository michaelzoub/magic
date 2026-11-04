import type { Checkpoint } from '@core/memory'

/** Minimal workspace shape a Memory card needs to pick its icons. */
export interface MemoryWorkspaceRef {
  id: string
  name: string
  icon: string
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Icon keys representing a checkpoint's two sides, for at-a-glance scanning:
 * - `beforeIcon`: the workspace the saved tabs came from. A Before snapshot
 *   carries only that workspace's name (`beforeTitle` is the outgoing
 *   workspace's name at record time), so it is matched by name.
 * - `afterIcon`: the workspace the switch landed in, matched by its reused
 *   workspace id (falling back to name).
 * Either is null when the workspace no longer exists (renamed/deleted), so
 * the card can fall back to a generic glyph instead of guessing.
 */
/** Recency bucket for a checkpoint's status-pill tint: fresher = greener. */
export type TimeAgoTone = 'fresh' | 'recent' | 'older' | 'old'

/**
 * "30 mins ago" for a checkpoint timestamp, plus its recency tone. Future
 * timestamps (clock skew) read as "Just now" rather than negative ages.
 */
export function timeAgo(ts: number, now: number): { label: string; tone: TimeAgoTone } {
  const mins = Math.max(0, Math.floor((now - ts) / 60_000))
  if (mins < 1) return { label: 'Just now', tone: 'fresh' }
  if (mins < 60) return { label: `${mins} min${mins === 1 ? '' : 's'} ago`, tone: 'fresh' }
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return { label: `${hrs} hr${hrs === 1 ? '' : 's'} ago`, tone: 'recent' }
  const days = Math.floor(hrs / 24)
  if (days < 7) return { label: `${days} day${days === 1 ? '' : 's'} ago`, tone: 'older' }
  if (days < 30) { const w = Math.floor(days / 7); return { label: `${w} wk${w === 1 ? '' : 's'} ago`, tone: 'old' } }
  if (days < 365) { const m = Math.floor(days / 30); return { label: `${m} mo${m === 1 ? '' : 's'} ago`, tone: 'old' } }
  const y = Math.floor(days / 365)
  return { label: `${y} yr${y === 1 ? '' : 's'} ago`, tone: 'old' }
}

export function checkpointIcons(
  checkpoint: Checkpoint,
  workspaces: readonly MemoryWorkspaceRef[]
): { beforeIcon: string | null; afterIcon: string | null } {
  const before = workspaces.find((w) => norm(w.name) === norm(checkpoint.before.title))
  const after =
    workspaces.find((w) => w.id === checkpoint.after.workspaceId) ??
    workspaces.find((w) => norm(w.name) === norm(checkpoint.after.title))
  return { beforeIcon: before?.icon ?? null, afterIcon: after?.icon ?? null }
}
