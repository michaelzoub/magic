import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Close } from './icons'
import { surface } from './surface'

/**
 * Centered modal dialog. Dark charcoal background via the shared `surface` (see
 * surface.ts — all dialogs/popups/dropdowns use it). Closes on backdrop
 * click or Escape. In Electron this is rendered by the overlay renderer
 * inside the native overlay view, which composites above the live page
 * view; in a plain browser it renders in-DOM as a fallback.
 */
export function Dialog({ open, onClose, label, hideHeader = false, children }: {
  open: boolean
  onClose(): void
  label: string
  /** Hide the title/close header row (the content provides its own heading); `label` still names the dialog. */
  hideHeader?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="no-drag fixed inset-0 z-50 grid place-items-center bg-black/60 p-6"
      onPointerDown={(e) => { console.log('DIALOG POINTERDOWN', e.isTrusted, e.pointerType, e.clientX, e.clientY, e.target === e.currentTarget); e.target === e.currentTarget && onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`flex max-h-full w-[min(680px,100%)] flex-col overflow-hidden rounded-[12px] animate-[pop-in_120ms_ease-out] ${surface}`}
      >
        {!hideHeader && (
          <header className="flex items-center gap-2 px-4 pb-2 pt-3.5">
            <h2 className="flex-1 text-[13px] font-semibold">{label}</h2>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded-[6px] text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <Close width={14} height={14} />
            </button>
          </header>
        )}
        {children}
      </div>
    </div>
  )
}
