import type { TabState } from '@shared/engine'

export type TabOperation =
  | { kind: 'added'; tab: TabState; index: number }
  | { kind: 'removed'; tab: TabState; index: number }
  | { kind: 'reused'; tab: TabState; index: number }

export interface TabDiff {
  operations: TabOperation[]
  /** A wholesale replacement (workspace switch, launch restore): not per-tab ops. */
  bulk: boolean
}

/**
 * Derive individual tab operations from two consecutive engine snapshots.
 * The engine snapshot is the source of truth for every tab mutation —
 * user clicks, approved agent proposals, and agent tool calls all land
 * there — so feedback driven by this diff corresponds to operations that
 * actually happened, never to simulated ones.
 *
 * A change touching several tabs at once is a bulk replacement (workspace
 * switches swap the whole open array, startup restores seed it), not a set
 * of individual operations, so it yields no per-tab feedback.
 */
export function diffTabs(
  prev: readonly TabState[],
  next: readonly TabState[],
  prevActiveId: string | null,
  nextActiveId: string | null
): TabDiff {
  const prevById = new Map(prev.map((t) => [t.id, t]))
  const nextIds = new Set(next.map((t) => t.id))

  const added: TabOperation[] = []
  const removed: TabOperation[] = []
  const reused: TabOperation[] = []

  next.forEach((tab, index) => {
    const before = prevById.get(tab.id)
    if (!before) added.push({ kind: 'added', tab, index })
    else if (before.url !== tab.url) reused.push({ kind: 'reused', tab, index })
  })
  prev.forEach((tab, index) => {
    if (!nextIds.has(tab.id)) removed.push({ kind: 'removed', tab, index })
  })

  // Activation of a tab that already existed is a reuse, unless the same
  // snapshot already reports it for another reason (e.g. it navigated).
  if (nextActiveId && nextActiveId !== prevActiveId && prevById.has(nextActiveId) && !reused.some((o) => o.tab.id === nextActiveId)) {
    const index = next.findIndex((t) => t.id === nextActiveId)
    if (index >= 0) reused.push({ kind: 'reused', tab: next[index], index })
  }

  const changed = added.length + removed.length
  const bulk = changed > 2 || (added.length > 0 && removed.length > 0) || (prev.length === 0 && added.length > 1)
  return { operations: bulk ? [] : [...removed, ...added, ...reused], bulk }
}
