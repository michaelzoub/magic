import { useEffect, useRef, useState } from 'react'
import type { TabState } from '@shared/engine'
import { motion } from '@/motion'
import { dragTarget } from './tabDrag'
import { diffTabs } from './tabFeedback'
import { feedbackBlueBg, feedbackRedBg } from './feedbackStyle'
import { Close, Globe, Plus } from '../ui/icons'
import { IconButton } from '../ui/IconButton'

interface Props {
  tabs: TabState[]
  activeTabId: string | null
  /** A tab an agent tool call is operating on right now (live tool events). */
  attention?: { tabId: string; kind: 'reused' | 'removed'; seq: number } | null
  /** Tabs an agent has decided to close (staged proposals awaiting approval): painted red until applied or dismissed. */
  markedForRemoval?: readonly string[]
  onSelect(id: string): void
  onClose(id: string): void | Promise<unknown>
  onNew(): void | Promise<unknown>
  onMove(id: string, toIndex: number): void
}

interface DragSession {
  id: string
  /** Index at drag start; Escape returns the tab here. */
  origIndex: number
  /** Index the tab occupies in the model (reorders live, like Chrome). */
  index: number
  /** clientX the current dx is anchored to; re-anchored on every swap. */
  startX: number
  /** Dragged tab's current offset from its model slot, in px. */
  dx: number
  /** Width of one tab slot (tab + gap), measured at drag start. */
  step: number
  count: number
  active: boolean
  /** A reorder is in flight to the engine; further swaps queue in `desired`. */
  awaiting: boolean
  desired: number | null
  /** Pointer released (or Esc): settle into the slot once the model lands. */
  finishing: boolean
  cancelled: boolean
  settling: boolean
}

const DRAG_THRESHOLD = 5
/** How long a removed tab's ghost slot takes to collapse away (no linger: closes must feel instant). */
const EXIT_MS = 220
/**
 * How long an added/reused/removed highlight stays painted. The operation
 * animation itself is ~200ms; the frame is then held so the user can
 * actually see which tab was touched — a sub-250ms pulse fired at the
 * start of an agent turn is gone before the reply is read.
 */
export const TAB_FEEDBACK_HOLD_MS = 2000
const SETTLE_MS = 180
const SHIFT_MS = 200
const EASE = 'cubic-bezier(0.2, 0, 0, 1)'

export function TabStrip({ tabs, activeTabId, attention, markedForRemoval, onSelect, onClose, onNew, onMove }: Props) {
  const stripRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<DragSession | null>(null)
  /** Visual lefts captured just before a live reorder, for the FLIP below. */
  const flipLefts = useRef<Map<string, number> | null>(null)
  const flipSeq = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  /** Only used to toggle dragged-tab styling; never per pointermove. */
  const [dragId, setDragId] = useState<string | null>(null)
  // --- Operation feedback (driven by real engine snapshots, see tabFeedback) ---
  /** Removed tabs kept as collapsing ghost slots until their exit finishes. */
  const [exiting, setExiting] = useState<{ tab: TabState; index: number }[]>([])
  /** Blue placeholder slot shown where a tab being created will appear. */
  const [pendingAdd, setPendingAdd] = useState(false)
  /** Tabs currently carrying a held operation frame, by tab id. */
  const [highlighted, setHighlighted] = useState<ReadonlyMap<string, 'added' | 'reused' | 'removed'>>(new Map())
  const flashTab = (tabId: string, kind: 'added' | 'reused' | 'removed') => {
    setHighlighted((m) => new Map(m).set(tabId, kind))
    later(() => {
      setHighlighted((m) => {
        if (m.get(tabId) !== kind) return m
        const next = new Map(m)
        next.delete(tabId)
        return next
      })
    }, TAB_FEEDBACK_HOLD_MS)
  }
  const prevSnapshot = useRef<{ tabs: TabState[]; activeTabId: string | null } | null>(null)

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms))
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const tabEls = () => stripRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]:not([data-exiting])')
  const elFor = (id: string) => stripRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`)

  /** The dragged tab tracks the pointer 1:1 — written straight to the DOM. */
  const paintDragged = (s: DragSession) => {
    const el = elFor(s.id)
    if (!el) return
    el.style.transition = 'none'
    el.style.transform = `translateX(${s.dx}px)`
  }

  /**
   * Reorder the model mid-drag, as Chrome does. Serialised: the engine's
   * snapshot is async, so a second swap requested before the first lands is
   * queued (`desired`) instead of racing it with a stale index.
   */
  const requestMove = (s: DragSession, target: number) => {
    if (s.awaiting) {
      s.desired = target
      return
    }
    // Capture true visual positions (transforms included) before the
    // reorder so neighbours can FLIP from where they are on screen.
    flipLefts.current = new Map()
    tabEls()?.forEach((el) => flipLefts.current!.set(el.dataset.tabId!, el.getBoundingClientRect().left))
    // The dragged tab stays under the pointer: its model slot moves by the
    // swap distance, so its offset from that slot shrinks by the same amount.
    s.dx -= (target - s.index) * s.step
    s.startX += (target - s.index) * s.step
    s.index = target
    s.awaiting = true
    onMove(s.id, target)
  }

  const settle = (s: DragSession) => {
    s.settling = true
    const el = elFor(s.id)
    if (el) {
      el.style.transition = `transform ${SETTLE_MS}ms ${EASE}`
      el.style.transform = 'translateX(0px)'
    }
    later(() => {
      if (sessionRef.current !== s) return
      sessionRef.current = null
      if (el) {
        el.style.transition = ''
        el.style.transform = ''
      }
      setDragId(null)
    }, SETTLE_MS)
  }

  const finish = (s: DragSession, cancelled: boolean) => {
    if (s.finishing) return
    s.finishing = true
    s.cancelled = cancelled
    const goal = cancelled ? s.origIndex : s.index
    if (s.index !== goal) requestMove(s, goal)
    else if (!s.awaiting) settle(s)
    // Otherwise the tabs effect settles once the in-flight reorder lands;
    // this is only a backstop in case that snapshot never arrives.
    later(() => sessionRef.current === s && !s.settling && settle(s), 400)
  }

  // Land live reorders: FLIP the neighbours into their new slots and, if the
  // pointer is already up, settle the dragged tab. Runs when the engine's
  // reordered snapshot arrives — the only moment transforms may be dropped,
  // because layout now matches where the transforms were pointing.
  useEffect(() => {
    const s = sessionRef.current
    if (!s) return
    const landed = tabs.findIndex((t) => t.id === s.id)
    if (landed < 0) {
      // Dragged tab closed mid-drag.
      sessionRef.current = null
      flipLefts.current = null
      setDragId(null)
      return
    }
    if (!s.awaiting || landed !== s.index) return // stale snapshot, ignore
    s.awaiting = false

    const lefts = flipLefts.current
    flipLefts.current = null
    if (lefts) {
      tabEls()?.forEach((el) => {
        const id = el.dataset.tabId!
        const before = lefts.get(id)
        if (id === s.id || before === undefined) return
        el.style.transition = 'none'
        el.style.transform = ''
        const delta = before - el.getBoundingClientRect().left
        if (!delta) return
        el.style.transform = `translateX(${delta}px)`
        void el.offsetWidth // apply the start position before transitioning
        el.style.transition = `transform ${SHIFT_MS}ms ${EASE}`
        el.style.transform = 'translateX(0px)'
        // Token guards against a later FLIP on this element: only the
        // animation that is still current may clear its own styles.
        const token = String(++flipSeq.current)
        el.dataset.flip = token
        later(() => {
          if (el.dataset.flip !== token) return
          delete el.dataset.flip
          el.style.transition = ''
          el.style.transform = ''
        }, SHIFT_MS)
      })
    }
    // Keep the dragged tab glued to the pointer across the re-render.
    if (!s.settling) paintDragged(s)

    if (s.desired !== null && s.desired !== s.index) {
      const next = s.desired
      s.desired = null
      requestMove(s, next)
    } else if (s.finishing) {
      settle(s)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs])

  // Visualize individual operations as the engine reports them. Bulk
  // replacements (workspace switches, restores) intentionally get no
  // per-tab animation — the strip is never animated all at once.
  useEffect(() => {
    const prev = prevSnapshot.current
    prevSnapshot.current = { tabs, activeTabId }
    if (!prev) return
    const { operations, bulk } = diffTabs(prev.tabs, tabs, prev.activeTabId, activeTabId)
    if (bulk) {
      setExiting([])
      setPendingAdd(false)
      return
    }
    for (const op of operations) {
      if (op.kind === 'removed') {
        // The ghost slot animates the disappearance after the fact;
        // manual closes are never delayed for the sake of this feedback.
        setExiting((list) => (list.some((e) => e.tab.id === op.tab.id) ? list : [...list, { tab: op.tab, index: op.index }]))
        later(() => setExiting((list) => list.filter((e) => e.tab.id !== op.tab.id)), EXIT_MS)
      } else {
        if (op.kind === 'added') setPendingAdd(false)
        flashTab(op.tab.id, op.kind)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTabId])

  // An agent tool call is operating on a tab right now: paint its frame
  // for the duration (held, like snapshot-driven feedback above).
  useEffect(() => {
    if (!attention) return
    flashTab(attention.tabId, attention.kind)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attention?.seq])

  /**
   * Manual close is automatic: close immediately, no pre-close delay.
   * The red highlight-then-disappear sequence is reserved for agent
   * closes, which are paused upstream (tool bridge / proposal apply) so
   * the user can see what the agent is about to remove.
   */
  const handleClose = (id: string) => {
    void Promise.resolve(onClose(id)).catch(() => {})
  }

  /** New tab with feedback: a blue frame marks the slot until the tab lands. */
  const handleNew = () => {
    setPendingAdd(true)
    void Promise.resolve(onNew())
      .catch(() => setPendingAdd(false))
      // The snapshot effect clears the placeholder when the tab appears;
      // this only covers a create that lands without a visible addition.
      .finally(() => later(() => setPendingAdd(false), 250))
  }

  // Esc cancels mid-drag, like Chrome.
  useEffect(() => {
    if (!dragId) return
    const onKey = (e: KeyboardEvent) => {
      const s = sessionRef.current
      if (e.key === 'Escape' && s?.active && !s.settling) finish(s, true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  const onPointerMove = (e: { clientX: number }, tab: TabState) => {
    const s = sessionRef.current
    if (!s || s.id !== tab.id || s.settling || s.finishing) return
    if (!s.active) {
      if (Math.abs(e.clientX - s.startX) < DRAG_THRESHOLD) return
      s.active = true
      // Re-anchor so the tab doesn't jump by the threshold amount.
      s.startX = e.clientX
      motion.stop(elFor(tab.id))
      setDragId(tab.id)
      return
    }
    const raw = e.clientX - s.startX
    // The dragged tab never leaves the strip, like Chrome's.
    s.dx = Math.min(Math.max(raw, -s.index * s.step), (s.count - 1 - s.index) * s.step)
    paintDragged(s)
    const target = dragTarget(s.index, s.dx, s.step, s.count)
    if (target !== s.index) requestMove(s, target)
  }

  // Live tabs with removed tabs' ghost slots spliced back at their old
  // positions, so each disappearance animates exactly where the tab was.
  const display: { tab: TabState; ghost: boolean }[] = tabs.map((tab) => ({ tab, ghost: false }))
  for (const e of exiting) display.splice(Math.min(e.index, display.length), 0, { tab: e.tab, ghost: true })

  return (
    <div ref={stripRef} className="flex min-w-0 flex-1 items-center gap-1">
      {display.map(({ tab, ghost }, index) => {
        if (ghost) {
          return (
            <div
              key={`ghost-${tab.id}`}
              data-tab-id={tab.id}
              data-exiting="true"
              aria-hidden="true"
              ref={(el) => { if (el && !el.dataset.out) { el.dataset.out = '1'; motion.tabExit(el) } }}
              className={`pointer-events-none flex h-8 min-w-0 max-w-[220px] flex-1 basis-0 items-center gap-1.5 overflow-hidden rounded-[6px] pl-2.5 pr-1 text-sm text-chrome-muted ${feedbackRedBg}`}
            >
              {tab.favicon ? (
                <img src={tab.favicon} alt="" draggable={false} className="h-3.5 w-3.5 shrink-0 rounded-sm" />
              ) : (
                <Globe className="h-3.5 w-3.5 shrink-0 text-chrome-faint" />
              )}
              <span className="overflow-hidden whitespace-nowrap text-clip">{tab.title}</span>
            </div>
          )
        }
        const active = tab.id === activeTabId
        const isDragged = dragId === tab.id
        const tabIndex = tabs.findIndex((t) => t.id === tab.id)
        const marked = markedForRemoval?.includes(tab.id) ?? false
        const feedback = marked ? 'removed' : highlighted.get(tab.id)
        return (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            data-tab-feedback={feedback ?? undefined}
            data-marked-for-removal={marked || undefined}
            ref={(el) => { if (el && !el.dataset.in) { el.dataset.in = '1'; motion.tabIn(el) } }}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onMouseDown={() => onSelect(tab.id)}
            onAuxClick={(e) => e.button === 1 && handleClose(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' && tabIndex > 0) (e.preventDefault(), onMove(tab.id, tabIndex - 1))
              if (e.key === 'ArrowRight' && tabIndex < tabs.length - 1) (e.preventDefault(), onMove(tab.id, tabIndex + 1))
            }}
            onPointerDown={(e) => {
              if (e.button !== 0 || sessionRef.current) return
              const els = tabEls()
              const step = els && els.length > 1 ? els[1].offsetLeft - els[0].offsetLeft : e.currentTarget.offsetWidth + 4
              sessionRef.current = {
                id: tab.id, origIndex: tabIndex, index: tabIndex, startX: e.clientX, dx: 0, step,
                count: tabs.length, active: false, awaiting: false, desired: null,
                finishing: false, cancelled: false, settling: false
              }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => onPointerMove(e, tab)}
            onPointerUp={() => {
              const s = sessionRef.current
              if (!s || s.id !== tab.id) return
              if (s.active) finish(s, false)
              else sessionRef.current = null
            }}
            onPointerCancel={() => {
              const s = sessionRef.current
              if (s?.id === tab.id) s.active ? finish(s, true) : (sessionRef.current = null)
            }}
            style={{
              ...(isDragged ? { transform: `translateX(${sessionRef.current?.dx ?? 0}px)`, zIndex: 10 } : {}),
              ...(feedback === 'added' || feedback === 'reused' ? { backgroundColor: 'rgb(147 197 253 / 0.16)' } : {}),
              ...(feedback === 'removed' ? { backgroundColor: 'rgb(252 165 165 / 0.16)' } : {})
            }}
            className={`no-drag group relative flex h-8 min-w-0 max-w-[220px] flex-1 basis-0 touch-none items-center gap-1.5 rounded-[6px] pl-2.5 pr-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-chrome-faint [&_svg]:size-3.5
              ${isDragged ? 'cursor-grabbing shadow-[0_4px_16px_rgb(0_0_0/0.18)]' : 'cursor-grab'}
              ${active
                ? 'bg-chrome-active text-chrome-text'
                : 'text-chrome-muted hover:bg-chrome-hover/[0.05] hover:text-chrome-text'} ${tab.isDiscarded ? 'opacity-60' : ''}
              ${feedback === 'removed' ? feedbackRedBg : ''}
              ${feedback === 'added' || feedback === 'reused' ? feedbackBlueBg : ''}`}
          >
            {tab.favicon ? (
              <img src={tab.favicon} alt="" draggable={false} className="h-3.5 w-3.5 shrink-0 rounded-sm" />
            ) : (
              <Globe className={`h-3.5 w-3.5 shrink-0 text-chrome-faint ${tab.isLoading ? 'animate-pulse' : ''}`} />
            )}
            <span className="overflow-hidden whitespace-nowrap text-clip">{tab.title}</span>
            <button
              type="button"
              aria-label="Close tab"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => handleClose(tab.id)}
              className={`ml-auto grid h-5 w-5 shrink-0 place-items-center rounded text-chrome-faint hover:bg-chrome-hover/[0.08] hover:text-chrome-text
                ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <Close className="h-3 w-3" />
            </button>
          </div>
        )
      })}
      {pendingAdd && (
        <div
          aria-hidden="true"
          data-pending-tab="true"
          className={`h-8 min-w-0 max-w-[220px] flex-1 basis-0 animate-pulse rounded-[6px] ${feedbackBlueBg}`}
        />
      )}
      <IconButton tip="New tab" shortcut="⌘T" onClick={(e) => (motion.press(e.currentTarget), handleNew())} className="shrink-0">
        <Plus className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )
}
