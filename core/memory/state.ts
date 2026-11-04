import type {
  AfterSnapshot,
  BeforeSnapshot,
  Checkpoint,
  CheckpointId,
  MemoryState,
  RecordReorgInput,
  ReorgTransition,
  RestoreTransition,
  SavedTab,
  TabId,
  TabSnapshot,
  WorkspaceSwitchPlan
} from './types'

/**
 * Memory state transitions. Pure and immutable: every function returns a new
 * {@link MemoryState} and never mutates its input.
 *
 * Invariants enforced here:
 * - checkpoint ids and Before ids are unique across all of Memory — a
 *   re-used Before id would make two different tab sets indistinguishable
 * - After ids are NOT unique: re-entering a focus mode reuses its
 *   workspace id/title, so many checkpoints may point at the same After
 * - `transitions` always mirrors `checkpoints` (before.id → after.workspaceId)
 * - recording a reorg clears any restored checkpoint: you are in the focus
 *   mode now, not in a restored Before
 * - switching workspaces clears the current tab array and replaces it with
 *   the target's tabs (see {@link WorkspaceSwitchPlan}); never a merge
 */

/** Empty state, or `init` normalized so the transition map mirrors the checkpoints. */
export function createMemoryState(init: Partial<MemoryState> = {}): MemoryState {
  const seen = new Set<string>()
  const checkpoints = (init.checkpoints ?? []).map((c) => ({ ...c, meaningful: c.meaningful ?? false })).filter((c) => {
    if (seen.has(c.id) || seen.has(c.before.id)) return false
    seen.add(c.id)
    seen.add(c.before.id)
    return true
  })
  return {
    checkpoints,
    transitions: new Map(checkpoints.map((c) => [c.before.id, c.after.workspaceId])),
    restoredCheckpointId:
      init.restoredCheckpointId && checkpoints.some((c) => c.id === init.restoredCheckpointId)
        ? init.restoredCheckpointId
        : null
  }
}

const tagsOf = (tabs: SavedTab[]): string[] =>
  tabs.map((t) => {
    try {
      return t.title || new URL(t.url).hostname || t.url
    } catch {
      return t.title || t.url
    }
  })

function snapshot(input: {
  id: string
  title: string
  tabs: SavedTab[]
  activeTabId?: TabId | null
  createdAt: number
}): BeforeSnapshot | AfterSnapshot {
  const title = input.title.trim()
  if (!title) throw new Error('Snapshot title is required')
  const tabs = [...input.tabs]
  return {
    id: input.id,
    title,
    tabs,
    activeTabId:
      input.activeTabId && tabs.some((t) => t.id === input.activeTabId)
        ? input.activeTabId
        : (tabs[0]?.id ?? null),
    tags: tagsOf(tabs),
    createdAt: input.createdAt
  }
}

/**
 * Plan a workspace switch: close every current tab, open exactly the
 * target snapshot's tabs. This is the only way tab arrays change on a
 * workspace switch, so the clear-and-replace invariant holds by construction.
 */
export function planWorkspaceSwitch(
  currentTabs: readonly Pick<SavedTab, 'id'>[],
  target: TabSnapshot
): WorkspaceSwitchPlan {
  return {
    closeTabIds: currentTabs.map((t) => t.id),
    tabs: [...target.tabs],
    activeTabId: target.activeTabId
  }
}

/**
 * Transition: user selects a focus mode → save the Before, save the
 * before→after id map, and hand back the workspace to make active.
 *
 * The caller enacts the browser side, e.g.:
 *   const { state, transition } = recordReorg(memory, input)
 *   browser.switchTo(transition.setActiveWorkspaceId) // also validates it exists
 */
export function recordReorg(
  state: MemoryState,
  input: RecordReorgInput
): { state: MemoryState; transition: ReorgTransition } {
  const createdAt = input.createdAt ?? Date.now()
  const checkpointId = input.checkpointId ?? crypto.randomUUID()
  const beforeId = input.beforeId ?? crypto.randomUUID()
  if (!checkpointId) throw new Error('Checkpoint id is required')
  if (!beforeId) throw new Error('Before snapshot id is required')
  if (state.checkpoints.some((c) => c.id === checkpointId)) {
    throw new Error(`Checkpoint id "${checkpointId}" already exists`)
  }
  if (state.transitions.has(beforeId)) {
    throw new Error(`Before snapshot id "${beforeId}" already exists`)
  }
  if (!input.after.workspaceId) throw new Error('Focus mode workspace id is required')

  const before = snapshot({
    id: beforeId,
    title: input.beforeTitle,
    tabs: input.beforeTabs,
    activeTabId: input.beforeActiveTabId,
    createdAt
  }) as BeforeSnapshot

  const after: AfterSnapshot = {
    ...(snapshot({
      id: input.after.workspaceId,
      title: input.after.title,
      tabs: input.after.tabs,
      activeTabId: input.after.activeTabId,
      createdAt
    }) as AfterSnapshot),
    workspaceId: input.after.workspaceId
  }

  const checkpoint: Checkpoint = {
    id: checkpointId,
    before,
    after,
    createdAt,
    meaningful: input.meaningful ?? false,
    meaningfulReason: input.meaningfulReason ?? null
  }
  const next: MemoryState = {
    checkpoints: [...state.checkpoints, checkpoint],
    transitions: new Map(state.transitions).set(before.id, after.workspaceId),
    restoredCheckpointId: null
  }
  return {
    state: next,
    transition: {
      checkpoint,
      fromSnapshotId: before.id,
      toWorkspaceId: after.workspaceId,
      setActiveWorkspaceId: after.workspaceId,
      // The Before tabs are the current array; they are cleared, not kept.
      replaceTabs: planWorkspaceSwitch(input.beforeTabs, after)
    }
  }
}

/**
 * Transition: user picks a checkpoint in Memory → clear the current tabs
 * and replace them with its Before tabs. `currentTabs` is the live tab
 * array being switched away from; every one of its ids is closed.
 * Marks the checkpoint restored until the next reorg supersedes it.
 */
export function restoreCheckpoint(
  state: MemoryState,
  checkpointId: CheckpointId,
  currentTabs: readonly Pick<SavedTab, 'id'>[] = []
): { state: MemoryState; transition: RestoreTransition } {
  const checkpoint = state.checkpoints.find((c) => c.id === checkpointId)
  if (!checkpoint) throw new Error(`No checkpoint with id ${checkpointId}`)
  return {
    state: { ...state, restoredCheckpointId: checkpointId },
    transition: {
      checkpoint,
      replaceTabs: planWorkspaceSwitch(currentTabs, checkpoint.before),
      fromWorkspaceId: state.transitions.get(checkpoint.before.id) ?? null
    }
  }
}

/** Fetch the focus mode a Before landed in, via the saved id→id map. */
export function getTransitionTarget(state: MemoryState, beforeId: string): string | null {
  return state.transitions.get(beforeId) ?? null
}

/**
 * Apply the agent's verdict to a saved checkpoint. The checkpoint stays in
 * the full history either way; `meaningful` only controls whether it is
 * shown to the user.
 */
export function setCheckpointMeaning(
  state: MemoryState,
  checkpointId: CheckpointId,
  meaningful: boolean,
  reason?: string | null
): MemoryState {
  if (!state.checkpoints.some((c) => c.id === checkpointId)) throw new Error(`No checkpoint with id ${checkpointId}`)
  return {
    ...state,
    checkpoints: state.checkpoints.map((c) =>
      c.id === checkpointId ? { ...c, meaningful, meaningfulReason: reason ?? null } : c
    )
  }
}

export function getCheckpoint(state: MemoryState, checkpointId: CheckpointId): Checkpoint | null {
  return state.checkpoints.find((c) => c.id === checkpointId) ?? null
}

/** Most recent first, as the Memory dialog lists them. */
export function listCheckpoints(state: MemoryState): Checkpoint[] {
  return [...state.checkpoints].reverse()
}
