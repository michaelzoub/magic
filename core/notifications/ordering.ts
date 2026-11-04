import type { AgentSwitchNoticeState } from '@shared/agent'
import type { WorkspaceDriftNoticeState } from '@shared/overlay'

/**
 * Notification ordering: which floating notice is on screen, and which
 * are queued behind it.
 *
 * Until now the agent switch notice (bottom-center dock) and the drift
 * toast rendered independently, so they could overlap,
 * clip into each other's overlay bounds, and compete for attention with
 * no rule for who wins. The rule here: exactly one notification is
 * visible — the highest-priority one — and the rest queue in priority
 * order, appearing as the visible one is dismissed/applied/expires.
 *
 * Priority (highest first):
 *  1. Agent notice awaiting a decision (proposals to apply/dismiss) —
 *     it blocks on the user, and its tabs are already staged.
 *  2. Agent notice reporting failure — the user should see the run broke.
 *  3. Agent notice still running — live progress; pre-empting it would
 *     hide the only feedback that a switch run is in flight.
 *  4. Agent notice concluded with nothing to do (done/skipped info).
 *  5. Drift warning — passive and self-expiring; it can wait, and when
 *     it is pre-empted its auto-dismiss timer restarts on re-show, so
 *     queuing never eats its screen time.
 *
 * Pure and deterministic: same inputs, same order, in both renderers
 * (shell fallback and native overlay).
 */

export type NotificationKind = 'agent' | 'drift'

export interface OrderedNotification {
  kind: NotificationKind
  priority: number
}

export function agentNoticePriority(notice: AgentSwitchNoticeState): number {
  if (notice.phase === 'done' && notice.proposals.length > 0) return 40
  if (notice.phase === 'failed') return 30
  if (notice.phase === 'running') return 20
  return 15 // done with no proposals, or skipped: informational only
}

export const DRIFT_NOTICE_PRIORITY = 10

/** All pending notifications, highest priority first. */
export function orderNotifications(input: {
  agent: AgentSwitchNoticeState | null
  drift: WorkspaceDriftNoticeState | null
}): OrderedNotification[] {
  const pending: OrderedNotification[] = []
  if (input.agent) pending.push({ kind: 'agent', priority: agentNoticePriority(input.agent) })
  if (input.drift) pending.push({ kind: 'drift', priority: DRIFT_NOTICE_PRIORITY })
  // Stable, deterministic: priority desc, then kind name so ties never
  // depend on object identity or render order.
  return pending.sort((a, b) => b.priority - a.priority || a.kind.localeCompare(b.kind))
}

/** The one notification that should be on screen now, or null. */
export function visibleNotification(input: {
  agent: AgentSwitchNoticeState | null
  drift: WorkspaceDriftNoticeState | null
}): NotificationKind | null {
  return orderNotifications(input)[0]?.kind ?? null
}

/** Notifications waiting behind the visible one, in the order they will appear. */
export function queuedNotifications(input: {
  agent: AgentSwitchNoticeState | null
  drift: WorkspaceDriftNoticeState | null
}): NotificationKind[] {
  return orderNotifications(input).slice(1).map((n) => n.kind)
}
