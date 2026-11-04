import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Close } from './icons'
import { surface } from './surface'
import { motion } from '@/motion'

/**
 * Centered modal dialog. Dark charcoal background via the shared `surface` (see
 * surface.ts — all dialogs/popups/dropdowns use it). Closes on backdrop
 * click or Escape. In Electron this is rendered by the overlay renderer
 * inside the native overlay view, which composites above the live page
 * view; in a plain browser it renders in-DOM as a fallback.
 */
export function Dialog({ open, onClose, label, hideHeader = false, widthClass = 'w-[min(680px,100%)]', children }: {
  open: boolean
  onClose(): void
  label: string
  /** Hide the title/close header row (the content provides its own heading); `label` still names the dialog. */
  hideHeader?: boolean
  /** Panel width utility; defaults to the standard dialog width. Wider content (e.g. two-column layouts) can opt into more horizontal room. */
  widthClass?: string
  children: ReactNode
}) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // GSAP entrance (120ms): backdrop fades, panel pops + rows micro-stagger.
  useLayoutEffect(() => {
    if (!open) return
    if (backdropRef.current) motion.fade(backdropRef.current)
    if (panelRef.current) motion.surfaceIn(panelRef.current)
  }, [open ])

  if (!open) return null
  return (
    <div
      ref={backdropRef}
      className="no-drag fixed inset-0 z-50 grid place-items-center bg-black/60 p-6"
      onPointerDown={(e) => { console.log('DIALOG POINTERDOWN', e.isTrusted, e.pointerType, e.clientX, e.clientY, e.target === e.currentTarget); e.target === e.currentTarget && onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`flex max-h-full ${widthClass} flex-col overflow-hidden rounded-lg ${surface}`}
      >
        {!hideHeader && (
          <header className="flex items-center gap-2 px-4 pb-2 pt-3">
            <h2 className="flex-1 text-sm font-semibold">{label}</h2>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              className="grid h-6 w-6 place-items-center rounded-[6px] text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
            >
              <Close width={12} height={12} />
            </button>
          </header>
        )}
        {children}
      </div>
    </div>
  )
}
