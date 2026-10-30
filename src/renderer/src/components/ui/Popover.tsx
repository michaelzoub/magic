import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { surface } from './surface'

type Placement = 'bottom-start' | 'right-start'

const place: Record<Placement, string> = {
  'bottom-start': 'left-0 right-0 top-full mt-1 origin-top',
  'right-start': 'left-full top-0 ml-2 w-[200px] origin-top-left',
}

/**
 * Anchored floating panel. Render it inside a `relative` wrapper next to its
 * trigger; it closes on outside pointerdown or Escape. Placement must avoid the
 * native page view, which paints above the renderer.
 */
export function Popover({ open, onClose, placement = 'bottom-start', label, children }: {
  open: boolean
  onClose(): void
  placement?: Placement
  label?: string
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

  if (!open) return null
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={`no-drag absolute z-50 min-w-[180px] rounded-[8px] p-1 text-[12px] animate-[pop-in_120ms_ease-out] ${surface} ${place[placement]}`}
    >
      {children}
    </div>
  )
}
