import type { ReactNode } from 'react'
import { surface } from './surface'

type Side = 'top' | 'right' | 'bottom'

// Position + a 2px rest offset that settles toward the anchor on hover.
const place: Record<Side, string> = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-0.5 group-hover/tip:translate-y-0',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2 -translate-y-0.5 group-hover/tip:translate-y-0',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2 -translate-x-0.5 group-hover/tip:translate-x-0',
}

/**
 * Figma-style hover hint. CSS-only so it costs nothing at rest; appears after a
 * short delay and hides instantly. Pick a side away from the native page view,
 * which paints above the renderer.
 */
export function Tooltip({ label, shortcut, side = 'bottom', children }: {
  label: string
  shortcut?: string
  side?: Side
  children: ReactNode
}) {
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
