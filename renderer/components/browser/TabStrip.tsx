import { useEffect, useRef, useState } from 'react'
import type { TabState } from '@shared/engine'
import { motion } from '@/motion'
import { dragTarget } from './tabDrag'
import { Close, Globe, Plus } from '../ui/icons'
import { IconButton } from '../ui/IconButton'

interface Props {
  tabs: TabState[]
  activeTabId: string | null
  onSelect(id: string): void
  onClose(id: string): void
  onNew(): void
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
const SETTLE_MS = 180
const SHIFT_MS = 200
const EASE = 'cubic-bezier(0.2, 0, 0, 1)'

export function TabStrip({ tabs, activeTabId, onSelect, onClose, onNew, onMove }: Props) {
  const stripRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<DragSession | null>(null)
  /** Visual lefts captured just before a live reorder, for the FLIP below. */
  const flipLefts = useRef<Map<string, number> | null>(null)
  const flipSeq = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  /** Only used to toggle dragged-tab styling; never per pointermove. */
  const [dragId, setDragId] = useState<string | null>(null)

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms))
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const tabEls = () => stripRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]')
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

  return (
    <div ref={stripRef} className="flex min-w-0 flex-1 items-center gap-1">
      {tabs.map((tab, index) => {
        const active = tab.id === activeTabId
        const isDragged = dragId === tab.id
        return (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            ref={(el) => { if (el && !el.dataset.in) { el.dataset.in = '1'; motion.tabIn(el) } }}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onMouseDown={() => onSelect(tab.id)}
            onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' && index > 0) (e.preventDefault(), onMove(tab.id, index - 1))
              if (e.key === 'ArrowRight' && index < tabs.length - 1) (e.preventDefault(), onMove(tab.id, index + 1))
            }}
            onPointerDown={(e) => {
              if (e.button !== 0 || sessionRef.current) return
              const els = tabEls()
              const step = els && els.length > 1 ? els[1].offsetLeft - els[0].offsetLeft : e.currentTarget.offsetWidth + 4
              sessionRef.current = {
                id: tab.id, origIndex: index, index, startX: e.clientX, dx: 0, step,
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
            style={isDragged ? { transform: `translateX(${sessionRef.current?.dx ?? 0}px)`, zIndex: 10 } : undefined}
            className={`no-drag group relative flex h-8 min-w-0 max-w-[220px] flex-1 basis-0 touch-none items-center gap-2 rounded-lg pl-3 pr-1 text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-chrome-faint
              ${isDragged ? 'cursor-grabbing shadow-[0_4px_16px_rgb(0_0_0/0.18),0_0_0_1px_rgb(var(--chrome-border)/0.10)]' : 'cursor-grab'}
              ${active
                ? 'bg-chrome-active text-chrome-text shadow-[0_0_0_1px_rgb(var(--chrome-border)/0.10),0_1px_2px_rgb(0_0_0/0.05)]'
                : 'text-chrome-muted hover:bg-chrome-hover/[0.05] hover:text-chrome-text'} ${tab.isDiscarded ? 'opacity-60' : ''}`}
          >
            {tab.favicon ? (
              <img src={tab.favicon} alt="" draggable={false} className="h-3.5 w-3.5 shrink-0 rounded-sm" />
            ) : (
              <Globe className={`h-3.5 w-3.5 shrink-0 text-chrome-faint ${tab.isLoading ? 'animate-pulse' : ''}`} />
            )}
            <span className="truncate">{tab.title}</span>
            <button
              type="button"
              aria-label="Close tab"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onClose(tab.id)}
              className={`ml-auto grid h-5 w-5 shrink-0 place-items-center rounded text-chrome-faint hover:bg-chrome-hover/[0.08] hover:text-chrome-text
                ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <Close className="h-3 w-3" />
            </button>
          </div>
        )
      })}
      <IconButton tip="New tab" shortcut="⌘T" onClick={(e) => (motion.press(e.currentTarget), onNew())} className="shrink-0">
        <Plus className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )
}
