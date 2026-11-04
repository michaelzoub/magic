import { useEffect } from 'react'
import { Close } from '../ui/icons'
import { surface } from '../ui/surface'

/**
 * Very small, non-obtrusive heads-up shown bottom-right when the user
 * seems to drift off the active workspace's goal: same dark popup surface
 * as the other floating UI, one line, auto-dismisses. It only warns and
 * recommends quitting; the workspace stays active unless the user clicks Quit.
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
    <div
      role="status"
      aria-live="polite"
      className={`no-drag fixed bottom-3 right-3 z-50 flex max-w-[280px] items-center gap-1.5 rounded-[8px] py-1.5 pl-2.5 pr-1.5 text-2xs leading-tight ${surface}`}
    >
      <span className="min-w-0">
        Those tabs look unrelated to <span className="font-medium">“{workspaceName}”</span>. Quit the workspace?
      </span>
      <button
        type="button"
        onClick={onQuit}
        className="shrink-0 rounded-[5px] px-1.5 py-0.5 font-medium text-white transition-colors hover:bg-white/10"
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
  )
}
