import { useEffect } from 'react'
import { Close, WarningTriangle } from '../ui/icons'
import { surface } from '../ui/surface'

/**
 * Toast shown when the model judges the user's tabs unrelated to the
 * active workspace's goal. Like every notification (see the agent switch
 * notice), it docks bottom-center — never in a corner — and notification
 * ordering decides which one occupies the dock at a time. Dark charcoal
 * surface, a coloured warning icon, a bold title over a muted description,
 * and one white pill action. It only warns and recommends quitting; the
 * workspace stays active unless the user clicks Quit. Auto-dismisses.
 */
export function WorkspaceDriftNotice({ workspaceName, onDismiss, onQuit }: {
  workspaceName: string
  onDismiss(): void
  onQuit(): void
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 10000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3">
      <div
        role="status"
        aria-live="polite"
        className={`no-drag pointer-events-auto flex w-[340px] max-w-[calc(100vw-24px)] items-center gap-3 rounded-2xl px-3.5 py-3 ring-1 ring-white/10 ${surface}`}
      >
      <WarningTriangle className="h-6 w-6 shrink-0 text-amber-400 drop-shadow-[0_2px_6px_rgb(245_158_11/0.45)]" />
      <span className="min-w-0 flex-1">
        <span className="block overflow-hidden whitespace-nowrap text-clip text-sm font-semibold leading-tight text-white">
          Off track from “{workspaceName}”?
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-white/55">
          Those tabs look unrelated to this workspace’s goal.
        </span>
      </span>
      <button
        type="button"
        onClick={onQuit}
        className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 transition-colors hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        Quit
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      >
          <Close className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
