import { useCallback, useEffect, useState } from 'react'
import {
  createMemoryState,
  listCheckpoints,
  recordReorg,
  restoreCheckpoint,
  type CheckpointId,
  type MemoryState,
  type RecordReorgInput,
  type RestoreTransition,
  type SavedTab
} from '../../../core/memory'

const tab = (id: string, title: string, url: string): SavedTab => ({ id, title, url })

const CODE_FOCUS: RecordReorgInput['after'] = {
  workspaceId: 'code-focus',
  title: 'Code Focus Mode',
  tabs: [
    tab('seed-gh', 'magic — GitHub', 'https://github.com/'),
    tab('seed-ts', 'TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/intro.html')
  ],
  activeTabId: 'seed-gh'
}

/**
 * Mock seed used only when no persisted Memory exists yet. Two different
 * Befores landing in the same reused focus mode, as `recordReorg` models it.
 * Real transitions (recorded via `record` below) are persisted and rehydrated
 * by `initialState`, replacing the seed's role after the first run.
 */
function seed(): MemoryState {
  const now = Date.now()
  const first = recordReorg(createMemoryState(), {
    beforeTabs: [
      tab('seed-yt', 'lofi hip hop radio 📚 beats to relax/study to', 'https://www.youtube.com/'),
      tab('seed-gc', 'Algebra II — Google Classroom', 'https://classroom.google.com/'),
      tab('seed-gh', 'magic — GitHub', 'https://github.com/')
    ],
    beforeActiveTabId: 'seed-gc',
    beforeTitle: 'Music, school & code mix',
    after: CODE_FOCUS,
    createdAt: now - 42 * 60_000
  })
  const second = recordReorg(first.state, {
    beforeTabs: [
      tab('seed-sp', 'Spotify — Chill Mix', 'https://open.spotify.com/'),
      tab('seed-so', 'How to center a div — Stack Overflow', 'https://stackoverflow.com/'),
      tab('seed-mdn', 'Array.prototype.map() — MDN', 'https://developer.mozilla.org/')
    ],
    beforeActiveTabId: 'seed-sp',
    beforeTitle: 'Music & coding rabbit hole',
    after: CODE_FOCUS,
    createdAt: now - 6 * 60_000
  })
  return second.state
}

const STORAGE_KEY = 'magic.memory.v1'

/**
 * Rehydrate the persisted MemoryState, falling back to the seed. Only the
 * checkpoints + restored id are stored: `createMemoryState` rebuilds the
 * before→after transition map from the checkpoints, so it cannot drift.
 */
function initialState(): MemoryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MemoryState>
      if (Array.isArray(parsed.checkpoints)) {
        return createMemoryState({ checkpoints: parsed.checkpoints, restoredCheckpointId: parsed.restoredCheckpointId ?? null })
      }
    }
  } catch {
    // Corrupt/unavailable storage: fall through to the seed.
  }
  return seed()
}

/** Renderer-side Memory state, driven entirely by the core transitions. */
export function useMemory() {
  const [state, setState] = useState<MemoryState>(initialState)

  // Persist every recorded transition/restore so Memory survives a reload.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ checkpoints: state.checkpoints, restoredCheckpointId: state.restoredCheckpointId })
      )
    } catch {
      // Persistence is best-effort; Memory still works for the session.
    }
  }, [state])

  /** Agent-initiated reorg: save Before + id→id map; caller activates the workspace. */
  const record = useCallback((input: RecordReorgInput) => {
    let transition: ReturnType<typeof recordReorg>['transition'] | null = null
    setState((s) => {
      try {
        const next = recordReorg(s, input)
        transition = next.transition
        return next.state
      } catch {
        return s
      }
    })
    return transition
  }, [])

  /** Returns the clear-and-replace plan for the Before, or null if unknown. */
  const restore = useCallback(
    (checkpointId: CheckpointId, currentTabs: readonly Pick<SavedTab, 'id'>[] = []): RestoreTransition | null => {
      let transition: RestoreTransition | null = null
      setState((s) => {
        try {
          const next = restoreCheckpoint(s, checkpointId, currentTabs)
          transition = next.transition
          return next.state
        } catch {
          return s
        }
      })
      return transition
    },
    []
  )

  return { state, checkpoints: listCheckpoints(state), restoredCheckpointId: state.restoredCheckpointId, record, restore }
}

export type UseMemory = ReturnType<typeof useMemory>
