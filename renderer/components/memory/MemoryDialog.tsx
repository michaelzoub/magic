import { useEffect, useMemo, useState } from 'react'
import type { Checkpoint, CheckpointId } from '@core/memory'
import { ArrowUp, ArrowUpRight, Bookmark, ChevronDown, Layers, Search, Tabs } from '../ui/icons'
import { Button, Chip, Dialog, type ChipVariant } from '../ui'
import { workspaceIcon } from '@/hooks/useWorkspaces'
import { checkpointIcons, timeAgo, type MemoryWorkspaceRef, type TimeAgoTone } from './memoryCard'

/** Which side of a checkpoint to navigate to. */
export type MemoryNavigateTarget = 'before' | 'after'

const PAGE_SIZE = 5

/** The shared icon-button look (see Dialog's close button). */
const iconButton =
  'no-drag grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 [&_svg]:size-3.5'

/** Chip variant per recency tone. */
const toneVariant: Record<TimeAgoTone, ChipVariant> = {
  fresh: 'fresh',
  recent: 'recent',
  older: 'older',
  old: 'neutral'
}

function dayLabel(ts: number): string {
  const d = new Date(ts)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

/** "Blueprint, portfolio references + 2 more tabs" from the saved tab titles. */
function tabSummary(checkpoint: Checkpoint): string {
  const titles = checkpoint.before.tabs.map((t) => t.title).filter(Boolean)
  if (titles.length === 0) return 'No tabs saved'
  const head = titles.slice(0, 2).join(', ')
  const rest = titles.length - 2
  return rest > 0 ? `${head} + ${rest} more tab${rest === 1 ? '' : 's'}` : head
}

function CheckpointRow({ checkpoint, workspaces, now, kept, onToggleKept, onNavigate }: {
  checkpoint: Checkpoint
  workspaces: readonly MemoryWorkspaceRef[]
  /** Current time from the dialog's tick, so "x mins ago" stays live. */
  now: number
  kept: boolean
  onToggleKept(): void
  onNavigate(id: CheckpointId, target: MemoryNavigateTarget): void
}) {
  const ago = timeAgo(checkpoint.createdAt, now)
  const { beforeIcon, afterIcon } = checkpointIcons(checkpoint, workspaces)
  const BeforeIcon = beforeIcon ? workspaceIcon(beforeIcon) : Layers
  const AfterIcon = afterIcon ? workspaceIcon(afterIcon) : Layers
  return (
    <li data-animate-item className="flex items-center gap-2 rounded-[6px] px-2 py-2 transition-colors hover:bg-white/[0.04]">
      {/* Leading tile for the saved (Before) workspace, so cards scan by icon
          as well as by name; the destination keeps its own glyph inline below. */}
      <span
        aria-hidden="true"
        title={checkpoint.before.title}
        className="grid h-7 w-7 shrink-0 place-items-center self-start rounded-[6px] bg-white/[0.06] text-white/70 [&_svg]:size-3.5"
      >
        <BeforeIcon width={16} height={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-white" title={checkpoint.before.title}>
          {checkpoint.before.title}
        </div>
        {/* Origin indicator directly under the headline: the other workspace,
            with an arrow pointing up to the headline it switched into. */}
        <div className="mt-0.5 flex items-center gap-1 truncate text-2xs text-white/40">
          <ArrowUp aria-hidden="true" width={12} height={12} className="shrink-0 text-white/35" />
          <AfterIcon aria-hidden="true" width={12} height={12} className="shrink-0 text-white/35" />
          <span className="sr-only">Switched from </span>
          <span className="truncate" title={checkpoint.after.title}>{checkpoint.after.title}</span>
        </div>
        <div className="mt-0.5 truncate text-2xs text-white/40" title={tabSummary(checkpoint)}>
          {tabSummary(checkpoint)}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-2xs text-white/40">
          {/* Relative time as a status chip; the exact time stays as its tooltip. */}
          <Chip variant={toneVariant[ago.tone]}>
            <time dateTime={new Date(checkpoint.createdAt).toISOString()} title={new Date(checkpoint.createdAt).toLocaleString()}>
              {ago.label}
            </time>
          </Chip>
          <span className="truncate">{kept ? 'Kept by you' : 'Automatic'}</span>
        </div>
      </div>

      <button
        type="button"
        aria-label={kept ? `Remove "${checkpoint.before.title}" from Kept` : `Keep "${checkpoint.before.title}"`}
        aria-pressed={kept}
        onClick={onToggleKept}
        className={iconButton}
      >
        <Bookmark width={14} height={14} className={kept ? 'fill-white text-white' : undefined} />
      </button>

      <Button
        aria-label={`Resume ${checkpoint.before.title}`}
        onClick={() => onNavigate(checkpoint.id, 'before')}
      >
        Resume
        <ArrowUpRight width={12} height={12} />
      </Button>
    </li>
  )
}

/**
 * Memory: pick up where you left off. Every agent-initiated reorg is saved
 * as a Before → After checkpoint, but callers pass only the ones the agent
 * judged meaningful; a row resumes its Before tabs. Black bg comes from
 * the shared Dialog/surface — never set a background here.
 */
export function MemoryDialog({ open, checkpoints, workspaces: workspaceRefs = [], onClose, onNavigate }: {
  open: boolean
  checkpoints: Checkpoint[]
  /** Known workspaces, used only to give each card its workspace icons. */
  workspaces?: readonly MemoryWorkspaceRef[]
  onClose(): void
  onNavigate(id: CheckpointId, target: MemoryNavigateTarget): void
}) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'recent' | 'kept'>('recent')
  const [workspace, setWorkspace] = useState('all')
  const [keptIds, setKeptIds] = useState<ReadonlySet<CheckpointId>>(new Set())
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [savedOpen, setSavedOpen] = useState(true)
  // Tick while open so the cards' "x mins ago" pills don't go stale.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [open])

  const workspaces = useMemo(
    () => [...new Map(checkpoints.map((c) => [c.after.workspaceId, c.after.title])).entries()],
    [checkpoints]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return checkpoints.filter((c) => {
      if (tab === 'kept' && !keptIds.has(c.id)) return false
      if (workspace !== 'all' && c.after.workspaceId !== workspace) return false
      if (!q) return true
      const haystack = [c.before.title, c.after.title, ...c.before.tabs.map((t) => `${t.title} ${t.url}`)]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [checkpoints, query, tab, workspace, keptIds])

  const shown = filtered.slice(0, visible)
  const groups = useMemo(() => {
    const out: { label: string; items: Checkpoint[] }[] = []
    for (const c of shown) {
      const label = dayLabel(c.createdAt)
      const last = out[out.length - 1]
      if (last?.label === label) last.items.push(c)
      else out.push({ label, items: [c] })
    }
    return out
  }, [shown])

  const toggleKept = (id: CheckpointId) => {
    setKeptIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onClose={onClose} label="Memory">
      <div className="min-h-0 overflow-y-auto px-4 pb-3">
        <p className="pt-1 text-xs leading-5 text-white/50">Pick up where you left off.</p>

        <label className="mt-3 flex items-center gap-2 rounded-[6px] bg-white/[0.05] px-2.5 py-1.5 transition-colors focus-within:bg-white/[0.08] focus-within:ring-1 focus-within:ring-white/30">
          <Search width={14} height={14} className="shrink-0 text-white/30" />
          <span className="sr-only">Search saved context</span>
          <input
            value={query}
            onChange={(e) => { setQuery(e.currentTarget.value); setVisible(PAGE_SIZE) }}
            placeholder="Search saved context"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
          />
        </label>

        <div className="mt-3 flex items-center gap-1">
          {(['recent', 'kept'] as const).map((t) => (
            <Button
              key={t}
              variant={tab === t ? 'secondary' : 'ghost'}
              aria-pressed={tab === t}
              onClick={() => { setTab(t); setVisible(PAGE_SIZE) }}
              className="capitalize"
            >
              {t}
            </Button>
          ))}
          <div className="relative ml-auto">
            <label className="sr-only" htmlFor="memory-workspace">Workspace</label>
            <select
              id="memory-workspace"
              value={workspace}
              onChange={(e) => { setWorkspace(e.currentTarget.value); setVisible(PAGE_SIZE) }}
              className="no-drag h-7 appearance-none rounded-[6px] bg-transparent pl-2 pr-6 text-xs text-white/70 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-1 focus-visible:ring-white/30 [&>option]:text-black"
            >
              <option value="all">All workspaces</option>
              {workspaces.map(([id, title]) => (
                <option key={id} value={id}>{title}</option>
              ))}
            </select>
            <ChevronDown width={12} height={12} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40" />
          </div>
        </div>

        {checkpoints.length === 0 ? (
          <p className="py-8 text-xs leading-5 text-white/50">
            No meaningful checkpoints yet. Magic saves every moment, and the agent shows only the ones it judges worth returning to.
          </p>
        ) : shown.length === 0 ? (
          <p className="py-8 text-xs leading-5 text-white/50">
            {tab === 'kept' && !query
              ? 'Nothing kept yet. Use the bookmark on a moment to keep it here.'
              : 'No saved context matches your search.'}
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h3 className="px-2 pb-1 pt-4 text-2xs font-medium text-white/40">{g.label}</h3>
              <ul className="flex flex-col gap-1">
                {g.items.map((c) => (
                  <CheckpointRow
                    key={c.id}
                    checkpoint={c}
                    workspaces={workspaceRefs}
                    now={now}
                    kept={keptIds.has(c.id)}
                    onToggleKept={() => toggleKept(c.id)}
                    onNavigate={onNavigate}
                  />
                ))}
              </ul>
            </section>
          ))
        )}

        {filtered.length > visible && (
          <div className="py-3 text-center">
            <Button variant="ghost" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              Load older
              <ChevronDown width={12} height={12} />
            </Button>
          </div>
        )}

        <p className="flex items-center justify-center gap-2 pb-2 pt-3 text-center text-2xs text-white/40">
          <Tabs width={14} height={14} className="shrink-0" />
          Resuming replaces your current tabs with the saved ones.
        </p>
      </div>

      <div className="mt-2 shrink-0 px-4 py-3">
        <Button
          variant="ghost"
          aria-expanded={savedOpen}
          onClick={() => setSavedOpen((v) => !v)}
          className="-ml-2.5"
        >
          <ChevronDown width={13} height={13} className={`text-white/40 transition-transform ${savedOpen ? '' : '-rotate-90'}`} />
          What gets saved
        </Button>
        {savedOpen && (
          <p className="mt-1.5 pl-[18px] text-xs leading-5 text-white/50">
            Everything is saved, but only checkpoints the agent judges meaningful are shown here. Resume restores the tabs you had open before that change.
          </p>
        )}
      </div>
    </Dialog>
  )
}
