/**
 * Memory (checkpoint) data models. Pure data — no Electron, Chromium, or
 * UI dependencies. Consumed by the Memory dialog opened from the sidebar
 * (`components/MemoryDialog.tsx`), which renders these types as-is.
 *
 * Vocabulary:
 * - "Before" — the open tabs exactly as they were before an agent-initiated
 *   reorg (e.g. a concoction of music, school, and coding sites). Every
 *   Before is one-of-a-kind: a fresh id and an AI-generated title per reorg.
 * - "After" — the focus mode the reorg landed in (e.g. "Code Focus Mode":
 *   GitHub and docs only). Focus modes are a small, reused set, so an After
 *   reuses its workspace's id and title instead of minting new ones.
 * - "Checkpoint" — one recorded Before → After pair, restorable from Memory.
 */
import type { TabState } from '@shared/engine'
import type { TabId, WorkspaceId } from '../workspaces/types'

export type { TabId, WorkspaceId }

/** Unique per checkpoint. Never reused. */
export type CheckpointId = string
/** Unique per Before snapshot. Never reused — compare {@link FocusModeId}. */
export type SnapshotId = string
/**
 * Id of an After snapshot. Deliberately the {@link WorkspaceId} of the focus
 * mode, so it can be fetched from the workspace table (`BrowserStore.get`)
 * and is reused every time that focus mode is entered.
 */
export type FocusModeId = WorkspaceId

/** A tab as saved in a snapshot: the engine's tab, minus live-only state. */
export type SavedTab = Pick<TabState, 'id' | 'url' | 'title' | 'favicon'>

/**
 * A labelled set of open tabs at one moment. Shown as a tag in the Memory
 * dialog: `title` is the headline tag, `tags` are the per-tab title/URL
 * chips underneath it (e.g. "Spotify — …", "github.com/…").
 */
export interface TabSnapshot {
  id: SnapshotId | FocusModeId
  /** AI-generated for a Before; the focus mode's name for an After. */
  title: string
  tabs: SavedTab[]
  activeTabId: TabId | null
  /** Display tags derived from the tabs' titles/URLs at capture time. */
  tags: string[]
  createdAt: number
}

/** The Before side of a checkpoint: fresh id + AI title on every reorg. */
export interface BeforeSnapshot extends TabSnapshot {
  id: SnapshotId
}

/** The After side of a checkpoint: id/title reused from the focus mode. */
export interface AfterSnapshot extends TabSnapshot {
  id: FocusModeId
  /** Same value as `id`; named for fetching the workspace by id. */
  workspaceId: WorkspaceId
}

/**
 * Before-id → After-id (workspace id). Lets Memory fetch the focus mode a
 * checkpoint landed in from the workspace table without duplicating it.
 */
export type TransitionMap = Map<SnapshotId, FocusModeId>

export interface Checkpoint {
  id: CheckpointId
  before: BeforeSnapshot
  after: AfterSnapshot
  createdAt: number
}

export interface MemoryState {
  /** In the order recorded; most recent last. */
  checkpoints: Checkpoint[]
  /** `checkpoint.before.id → checkpoint.after.workspaceId`, one per checkpoint. */
  transitions: TransitionMap
  /** Checkpoint whose Before is currently restored, if any. Cleared on reorg. */
  restoredCheckpointId: CheckpointId | null
}

export interface RecordReorgInput {
  /** Currently open tabs, captured before the reorg touches anything. */
  beforeTabs: SavedTab[]
  beforeActiveTabId?: TabId | null
  /** AI-generated label for the Before (its tag in the dialog). */
  beforeTitle: string
  /** The focus mode being entered; its id/title are reused, not regenerated. */
  after: {
    workspaceId: WorkspaceId
    title: string
    tabs: SavedTab[]
    activeTabId?: TabId | null
  }
  /** Injectable for tests; defaults to fresh random ids / `Date.now()`. */
  checkpointId?: CheckpointId
  beforeId?: SnapshotId
  createdAt?: number
}

/**
 * How a workspace switch changes the open-tab array.
 *
 * Invariant: switching workspaces CLEARS the current tab array and replaces
 * it with the target snapshot's tabs — tabs are never merged or appended.
 * Every currently-open tab id appears in `closeTabIds` (even one whose URL
 * also appears in `tabs`; it is reopened as part of the new array), and the
 * resulting tab array is exactly `tabs`, in order.
 */
export interface WorkspaceSwitchPlan {
  /** All currently-open tab ids, to close. */
  closeTabIds: TabId[]
  /** The exact tab array after the switch, in order. */
  tabs: SavedTab[]
  /** Which of `tabs` to activate; null only when `tabs` is empty. */
  activeTabId: TabId | null
}

/**
 * What applying a reorg means for the browser, returned by `recordReorg` so
 * the caller can enact it (e.g. `BrowserStore.switchTo(setActiveWorkspaceId)`)
 * without this module depending on the workspace store.
 */
export interface ReorgTransition {
  checkpoint: Checkpoint
  /** Save this pair: `fromSnapshotId → toWorkspaceId`. */
  fromSnapshotId: SnapshotId
  toWorkspaceId: WorkspaceId
  /** The workspace that must become `BrowserState.activeWorkspaceId`. */
  setActiveWorkspaceId: WorkspaceId
  /** Clear the Before tabs and replace them with the After (focus mode) tabs. */
  replaceTabs: WorkspaceSwitchPlan
}

/** What restoring a checkpoint means for the browser. */
export interface RestoreTransition {
  checkpoint: Checkpoint
  /** Clear the current tabs and replace them with the Before tabs. */
  replaceTabs: WorkspaceSwitchPlan
  /** Focus mode being left (fetchable via the transition map), if known. */
  fromWorkspaceId: WorkspaceId | null
}
