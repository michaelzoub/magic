import { useLayoutEffect, useRef, useState } from 'react'
import type { TabState } from '@shared/engine'
import { engine } from '@/engine'
import { motion } from '@/motion'

const DETACHED = { x: 0, y: 0, width: 0, height: 0 }

/**
 * Reserves the page area. The engine renders the native page surface over
 * these bounds; when the tab is blank, the shell's empty state shows through.
 *
 * While a dropdown/dialog is open (`hidden`), the native view must detach —
 * it paints above all renderer DOM, so it would cover the floating UI. To
 * keep the current site visible instead of blanking it, a still capture of
 * the page is shown in its place until the native view is restored.
 */
export function Viewport({ tab, hidden = false }: { tab: TabState | null; hidden?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [frozen, setFrozen] = useState<string | null>(null)
  const tabId = tab?.id
  const tabUrl = tab?.url

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let live = true
    const report = () => {
      if (hidden) return
      const r = el.getBoundingClientRect()
      engine.setViewportBounds({
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height)
      })
    }
    if (!hidden) {
      setFrozen(null)
      report()
    } else if (tabId && tabUrl) {
      // Capture before detaching so the still matches the live page, then
      // swap: frozen frame in, native view out. The timeout detaches anyway
      // if capture stalls, so floating UI is never stuck behind the page.
      const fallback = setTimeout(() => live && engine.setViewportBounds(DETACHED), 250)
      // A stale preload (dev main not yet restarted) may lack capturePage;
      // never let that throw inside the effect — just detach as before.
      const capture = typeof engine.capturePage === 'function' ? engine.capturePage(tabId) : Promise.resolve(null)
      capture.then((image) => {
        if (!live) return
        clearTimeout(fallback)
        setFrozen(image)
        engine.setViewportBounds(DETACHED)
      }).catch(() => {
        if (!live) return
        clearTimeout(fallback)
        engine.setViewportBounds(DETACHED)
      })
    } else {
      setFrozen(null)
      engine.setViewportBounds(DETACHED)
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    return () => {
      live = false
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [hidden, tabId, tabUrl])

  return (
    <div
      ref={ref}
      className="relative flex-1 overflow-hidden rounded-lg bg-chrome-panel shadow-[0_0_0_0.5px_rgb(var(--chrome-border)/0.08),0_1px_2px_rgb(0_0_0/0.04)]"
    >
      {hidden && frozen && tabUrl ? (
        <img src={frozen} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
      ) : !tabUrl && (
        <div ref={(el) => { if (el && !el.dataset.in) { el.dataset.in = '1'; motion.fadeIn(el, 0.05) } }} className="absolute inset-0 grid place-items-center">
          <p className="text-xs text-chrome-faint">Enter an address to begin</p>
        </div>
      )}
    </div>
  )
}
