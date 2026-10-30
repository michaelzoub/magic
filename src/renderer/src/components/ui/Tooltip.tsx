import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { TooltipSide } from '@shared/overlay'
import { surface } from './surface'

type Side = TooltipSide

const SHOW_DELAY_MS = 500

// Position + a 2px rest offset that settles toward the anchor on hover.
const place: Record<Side, string> = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-0.5 group-hover/tip:translate-y-0',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2 -translate-y-0.5 group-hover/tip:translate-y-0',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2 -translate-x-0.5 group-hover/tip:translate-x-0',
}

/**
 * Figma-style hover hint: appears after a short delay and hides instantly.
 * Inside the shell it renders in a native overlay so it can sit above the page
 * view (renderer DOM never can); in a plain browser it falls back to CSS.
 */
export function Tooltip({ label, shortcut, side = 'bottom', children }: {
  label: string
  shortcut?: string
  side?: Side
  children: ReactNode
}) {
  const overlay = window.overlay
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef<number>(undefined)
  const shown = useRef(false)

  const hide = () => {
    clearTimeout(timer.current)
    if (shown.current) overlay?.hideTooltip()
    shown.current = false
  }
  useEffect(() => hide, [])

  if (overlay) {
    const show = () => {
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        const r = ref.current?.getBoundingClientRect()
        if (!r) return
        shown.current = true
        overlay.showTooltip({ label, shortcut, side, anchor: { x: r.x, y: r.y, width: r.width, height: r.height } })
      }, SHOW_DELAY_MS)
    }
    return (
      <span ref={ref} className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide}>
        {children}
      </span>
    )
  }

  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 flex items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2 py-1 ${surface}
          text-[11px] font-medium leading-4 opacity-0
          transition-[opacity,transform] duration-100 ease-out group-hover/tip:opacity-100 group-hover/tip:delay-500 ${place[side]}`}
      >
        {label}
        {shortcut && <kbd className="font-sans text-white/45">{shortcut}</kbd>}
      </span>
    </span>
  )
}
