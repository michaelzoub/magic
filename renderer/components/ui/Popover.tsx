import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { surface } from './surface'
import { motion } from '@/motion'

type Placement = 'bottom-start' | 'bottom-end' | 'right-start' | 'right-end'

const place: Record<Placement, string> = {
  'bottom-start': 'left-0 right-0 top-full mt-1 origin-top',
  'bottom-end': 'right-0 top-full mt-1 w-[200px] origin-top-right',
  'right-start': 'left-full top-0 ml-2 w-[200px] origin-top-left',
  'right-end': 'bottom-0 left-full ml-2 w-[440px] origin-bottom-left',
}

/**
 * Anchored floating panel, plain-browser fallback. Render it inside a
 * `relative` wrapper next to its trigger; it closes on outside pointerdown
 * or Escape. In Electron, dropdowns render in the native overlay view
 * instead (see renderer/overlay), which composites above the page view.
 */
export function Popover({ open, onClose, placement = 'bottom-start', label, className = '', children }: {
  open: boolean
  onClose(): void
  placement?: Placement
  label?: string
  /** Extra classes appended after the shared surface (e.g. a light sheet overriding it with `!` utilities). */
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      // Ignore clicks on the trigger (the panel's parent) so it can toggle itself.
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  // GSAP entrance (120ms): pop + micro-staggered rows.
  useLayoutEffect(() => {
    if (open && ref.current) motion.surfaceIn(ref.current)
  }, [open ])

  if (!open) return null
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={`no-drag absolute z-50 min-w-[180px] rounded-[8px] p-1 text-xs ${surface} ${place[placement]} ${className}`}
    >
      {children}
    </div>
  )
}
