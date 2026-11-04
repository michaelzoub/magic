import { useEffect } from 'react'
import { Close } from '../ui/icons'
import { surface } from '../ui/surface'

/**
 * Very small, non-obtrusive heads-up shown bottom-right when Magic quits
 * the active workspace because the user drifted off its goal: same dark
 * popup surface as the other floating UI, one line, auto-dismisses.
 * The workspace exit itself has already happened — this only explains it;
 * the tabs stay open, now outside any workspace.
 */
export function WorkspaceDriftNotice({ workspaceName, onDismiss }: {
  workspaceName: string
  onDismiss(): void
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`no-drag fixed bottom-3 right-3 z-50 flex max-w-[280px] items-center gap-1.5 rounded-[8px] py-1.5 pl-2.5 pr-1.5 text-2xs leading-tight ${surface}`}
    >
      <span className="min-w-0">
        Left <span className="font-medium">“{workspaceName}”</span> — those tabs look unrelated to its goal.
      </span>
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
