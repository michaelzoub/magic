import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TabState } from '@shared/engine'
import { engine } from '@/adapters'
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
 *
 * The swap is sequenced by paint, not by state: the native view detaches only
 * after the capture has actually painted (below), and on close the capture
 * stays mounted underneath while the native view re-attaches over it.
 * Detaching/restoring in the same commit that mounts/unmounts the capture
 * leaves frames where neither is on screen — the flash this avoids.
 */
export function Viewport({ tab, hidden = false }: { tab: TabState | null; hidden?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [frozen, setFrozen] = useState<{ tabId: string; image: string } | null>(null)
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
      report()
    } else if (tabId && tabUrl) {
      // Capture before detaching so the still matches the live page. The
      // detach itself happens in the effect below, once the capture has
      // painted. The timeout detaches anyway if capture stalls, so floating
      // UI is never stuck behind the page.
      const fallback = setTimeout(() => live && engine.setViewportBounds(DETACHED), 250)
      // A stale preload (dev main not yet restarted) may lack capturePage;
      // never let that throw inside the effect — just detach as before.
      const capture = typeof engine.capturePage === 'function' ? engine.capturePage(tabId) : Promise.resolve(null)
      capture.then(async (image) => {
        if (!live) return
        clearTimeout(fallback)
        if (!image) return engine.setViewportBounds(DETACHED)
        // Decode before mounting so the <img>'s first paint has pixels.
        const pre = new Image()
        pre.src = image
        await pre.decode().catch(() => {})
        if (live) setFrozen({ tabId, image })
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

  // Detach only after the frozen frame has painted: two rAFs put us past the
  // commit that mounted the <img> and the paint that presented it, so the
  // first frame without the native view already shows the capture.
  useEffect(() => {
    if (!hidden || !frozen || frozen.tabId !== tabId) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => engine.setViewportBounds(DETACHED))
    })
    return () => (cancelAnimationFrame(first), cancelAnimationFrame(second))
  }, [hidden, frozen, tabId])

  // On close the native view re-attaches over the still-mounted capture;
  // drop the capture only once it is certainly covered.
  useEffect(() => {
    if (hidden || !frozen) return
    const t = setTimeout(() => setFrozen(null), 300)
    return () => clearTimeout(t)
  }, [hidden, frozen])

  return (
    <div
      ref={ref}
      className="relative flex-1 overflow-hidden bg-chrome-panel"
    >
      {frozen && frozen.tabId === tabId && tabUrl ? (
        <img src={frozen.image} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
      ) : !tabUrl && (
        <div ref={(el) => { if (el && !el.dataset.in) { el.dataset.in = '1'; motion.fadeIn(el, 0.05) } }} className="absolute inset-0 grid place-items-center">
          <p className="text-xs text-chrome-faint">Enter an address to begin</p>
        </div>
      )}
    </div>
  )
}
