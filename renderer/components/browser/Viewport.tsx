import { useLayoutEffect, useRef } from 'react'
import type { TabState } from '@shared/engine'
import type { Checkpoint } from '@core/memory'
import { engine } from '@/adapters'
import { motion } from '@/motion'
import { ResumePrompt } from './ResumePrompt'

/**
 * Reserves the page area. The engine renders the native page surface over
 * these bounds; when the tab is blank, the shell's empty state shows through.
 *
 * Dialogs/dropdowns never affect this component: they live in the native
 * overlay layer (see main/browser/floating-overlay.ts), which composites
 * above the page view. The page therefore stays live and attached at all
 * times — no detaching, and no screenshot painted in its place.
 */
export function Viewport({ tab, resume, onResume }: {
  tab: TabState | null
  /** Most recent workspace switch, offered as a pickup prompt on blank tabs. */
  resume?: Checkpoint | null
  onResume?(): void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => {
      const r = el.getBoundingClientRect()
      engine.setViewportBounds({
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height)
      })
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="relative flex-1 overflow-hidden rounded-lg bg-chrome-panel shadow-[0_0_0_0.5px_rgb(var(--chrome-border)/0.08),0_1px_2px_rgb(0_0_0/0.04)]"
    >
      {!tab?.url && (
        <div ref={(el) => { if (el && !el.dataset.in) { el.dataset.in = '1'; motion.fadeIn(el, 0.05) } }} className="absolute inset-0 grid place-items-center overflow-y-auto p-6">
          {resume && onResume ? (
            <ResumePrompt checkpoint={resume} onResume={onResume} />
          ) : (
            <p className="text-xs text-chrome-faint">Enter an address to begin</p>
          )}
        </div>
      )}
    </div>
  )
}
