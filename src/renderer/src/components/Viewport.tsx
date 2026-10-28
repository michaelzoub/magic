import { useLayoutEffect, useRef } from 'react'
import type { TabState } from '@shared/engine'
import { engine } from '@/engine'

/**
 * Reserves the page area. The engine renders the native page surface over
 * these bounds; when the tab is blank, the shell's empty state shows through.
 */
export function Viewport({ tab }: { tab: TabState | null }) {
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
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    report()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="relative flex-1 overflow-hidden rounded-lg bg-chrome-panel shadow-[0_0_0_0.5px_rgb(var(--chrome-border)/0.1),0_1px_3px_rgb(0_0_0/0.05)]"
    >
      {!tab?.url && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="text-xs text-chrome-faint">Enter an address to begin</p>
        </div>
      )}
    </div>
  )
}
