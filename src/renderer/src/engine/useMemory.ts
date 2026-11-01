import { useCallback, useState } from 'react'
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
 * Mock seed until the agent runtime records real reorgs; swap the initial
 * state for the persisted MemoryState then. Two different Befores landing
 * in the same reused focus mode, as `recordReorg` models it.
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

/** Renderer-side Memory state, driven entirely by the core transitions. */
export function useMemory() {
  const [state, setState] = useState<MemoryState>(seed)

  /** Agent-initiated reorg: save Before + id→id map; caller activates the workspace. */
  const record = useCallback((input: RecordReorgInput) => {
    let transition: ReturnType<typeof recordReorg>['transition'] | null = null
    setState((s) => {
      const next = recordReorg(s, input)
      transition = next.transition
      return next.state
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
