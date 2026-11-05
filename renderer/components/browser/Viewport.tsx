import { useLayoutEffect, useRef, useState } from 'react'
import type { TabState } from '@shared/engine'
import type { Checkpoint } from '@core/memory'
import { engine } from '@/adapters'
import { motion } from '@/motion'
import { ResumePrompt } from './ResumePrompt'
import { NewTabPage, type NewTabRecentItem } from './NewTabPage'

/**
 * Reserves the page area. The engine renders the native page surface over
 * these bounds; when the tab is blank, the shell's empty state shows through.
 *
 * Dialogs/dropdowns never affect this component: they live in the native
 * overlay layer (see main/browser/floating-overlay.ts), which composites
 * above the page view. The page therefore stays live and attached at all
 * times — no detaching, and no screenshot painted in its place.
 */
export function Viewport({ tab, resume, onResume, workspaceName, switchStats, recent, onNavigate, onOpenRecent, onViewAll }: {
  tab: TabState | null
  /**
   * Most recent workspace switch, offered only as a startup recovery
   * prompt. Callers gate this (see startupRecovery.ts): it is non-null
   * only at fresh app open with no tabs open, never mid-session.
   */
  resume?: Checkpoint | null
  onResume?(): void
  /** Active workspace name, shown under the new-tab search box ("In <workspace>"). */
  workspaceName?: string | null
  /** Workspace switch counts shown as stats on the new-tab page. */
  switchStats?: { today: number; pastWeek: number }
  /** Recently used tabs in the active workspace, as new-tab chips. */
  recent?: NewTabRecentItem[]
  onNavigate?(input: string): void
  onOpenRecent?(item: NewTabRecentItem): void
  onViewAll?(): void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Dismissing the startup recovery prompt ("Not now") swaps in the
  // new-tab page for that checkpoint, instead of a dead-end hint.
  const [dismissedResumeId, setDismissedResumeId] = useState<string | null>(null)
  const showResume = Boolean(resume && onResume && dismissedResumeId !== resume.id)
  const newTabPage = (
    <NewTabPage
      workspaceName={workspaceName}
      switchStats={switchStats}
      recent={recent ?? []}
      onNavigate={(input) => onNavigate?.(input)}
      onOpenRecent={(item) => onOpenRecent?.(item)}
      onViewAll={() => onViewAll?.()}
    />
  )

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
      className="relative flex-1 overflow-hidden bg-chrome-panel"
    >
      {!tab?.url && (
        <div ref={(el) => { if (el && !el.dataset.in) { el.dataset.in = '1'; motion.fadeIn(el, 0.05) } }} className="absolute inset-0 overflow-y-auto">
          {showResume && resume && onResume ? (
            <div className="grid min-h-full place-items-center p-6">
              <ResumePrompt checkpoint={resume} onResume={onResume} onDismissed={() => setDismissedResumeId(resume.id)} />
            </div>
          ) : (
            newTabPage
          )}
        </div>
      )}
    </div>
  )
}
