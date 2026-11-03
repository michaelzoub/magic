import type { Checkpoint, CheckpointId, TabSnapshot } from '@core/memory'
import { ChevronRight } from '../ui/icons'
import { Dialog } from '../ui'

/** Which side of a checkpoint to navigate to. */
export type MemoryNavigateTarget = 'before' | 'after'

const when = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** One side of a checkpoint: just its tag title and tab count. */
function SnapshotSide({ snapshot, kind }: { snapshot: TabSnapshot; kind: 'Before' | 'After' }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-white/40">{kind}</div>
      <div className="mt-1 truncate text-[12px] font-medium text-white" title={snapshot.title}>
        {snapshot.title}
      </div>
      <div className="mt-0.5 text-[11px] text-white/40">
        {snapshot.tabs.length} tab{snapshot.tabs.length === 1 ? '' : 's'}
      </div>
    </div>
  )
}

function NavigateButton({ label, title, onClick }: { label: string; title: string; onClick(): void }) {
  return (
    <button
      type="button"
      aria-label={`Navigate to ${title}`}
      onClick={onClick}
      className="no-drag h-7 shrink-0 rounded-[6px] bg-white/[0.08] px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-white/[0.14]"
    >
      {label}
    </button>
  )
}

function CheckpointRow({ checkpoint, onNavigate }: {
  checkpoint: Checkpoint
  onNavigate(id: CheckpointId, target: MemoryNavigateTarget): void
}) {
  return (
    <li className="rounded-[8px] p-3 transition-colors hover:bg-white/[0.04]">
      <div className="flex items-start gap-3">
        <SnapshotSide snapshot={checkpoint.before} kind="Before" />
        <ChevronRight className="mt-5 shrink-0 text-white/35" width={14} height={14} />
        <SnapshotSide snapshot={checkpoint.after} kind="After" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="flex-1 text-[11px] text-white/40">{when(checkpoint.createdAt)}</span>
        <NavigateButton label="Navigate to Before" title={checkpoint.before.title} onClick={() => onNavigate(checkpoint.id, 'before')} />
        <NavigateButton label="Navigate to After" title={checkpoint.after.title} onClick={() => onNavigate(checkpoint.id, 'after')} />
      </div>
    </li>
  )
}

/**
 * Memory: every agent-initiated reorg as a Before → After checkpoint.
 * Navigating to a side reopens that side's tabs. Black bg comes from the
 * shared Dialog/surface — never set a background here.
 */
export function MemoryDialog({ open, checkpoints, onClose, onNavigate }: {
  open: boolean
  checkpoints: Checkpoint[]
  onClose(): void
  onNavigate(id: CheckpointId, target: MemoryNavigateTarget): void
}) {
  return (
    <Dialog open={open} onClose={onClose} label="Memory">
      {checkpoints.length === 0 ? (
        <p className="px-4 pb-5 pt-1 text-[12px] leading-5 text-white/50">
          No checkpoints yet. When the agent reorganizes your tabs into a focus mode, the tabs you had open are saved
          here so you can go back to them.
        </p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto px-3 pb-3">
          {checkpoints.map((c) => (
            <CheckpointRow key={c.id} checkpoint={c} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </Dialog>
  )
}
