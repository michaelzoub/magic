import { useState } from 'react'
import type { Checkpoint } from '@core/memory'
import { Globe } from '../ui/icons'

const MAX_TABS = 4

/** "Today" / "Yesterday" / weekday / "Mar 4" — the day of the most recent switch. */
export function switchDay(ts: number, now = Date.now()): string {
  const day = 86_400_000
  const startOf = (t: number) => {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const daysAgo = Math.round((startOf(now) - startOf(ts)) / day)
  if (daysAgo <= 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  if (daysAgo < 7) return new Date(ts).toLocaleDateString(undefined, { weekday: 'long' })
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Blank-tab prompt built from the most recent workspace switch (the newest
 * Memory checkpoint): the muddled tab set left behind, the focus mode it
 * switched into, and the tabs that were open — so picking back up is one
 * click (`onResume` restores the Before side).
 */
export function ResumePrompt({ checkpoint, onResume }: { checkpoint: Checkpoint; onResume(): void }) {
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  if (dismissedId === checkpoint.id) {
    return <p className="text-xs text-chrome-faint">Enter an address to begin</p>
  }
  const { before, after } = checkpoint
  const shown = before.tabs.slice(0, MAX_TABS)
  const extra = before.tabs.length - shown.length
  return (
    <div className="w-full max-w-[520px] rounded-xl bg-neutral-800 p-5 text-left text-white shadow-[0_8px_28px_rgb(0_0_0/0.28),0_0_0_0.5px_rgb(255_255_255/0.08)]">
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">
        {switchDay(checkpoint.createdAt)} · most recent switch
      </p>
      <p className="mt-2 text-sm leading-6">
        You switched from <span className="font-medium">“{before.title}”</span> to{' '}
        <span className="font-medium">“{after.title}”</span>. Do you want to pick up where you left off?
      </p>
      {shown.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1">
          {shown.map((t) => (
            <li key={t.id} className="flex min-w-0 items-center gap-2.5 rounded-lg bg-white/[0.06] px-3 py-2">
              {t.favicon ? (
                <img src={t.favicon} alt="" draggable={false} className="h-3.5 w-3.5 shrink-0 rounded-sm" />
              ) : (
                <Globe className="h-3.5 w-3.5 shrink-0 text-white/40" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-white/90">{t.title || hostOf(t.url)}</span>
              <span className="shrink-0 truncate text-[11px] text-white/35">{hostOf(t.url)}</span>
            </li>
          ))}
          {extra > 0 && (
            <li className="px-3 pt-1 text-[11px] text-white/40">
              + {extra} more tab{extra === 1 ? '' : 's'} from “{before.title}”
            </li>
          )}
        </ul>
      )}
      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onResume}
          className="no-drag h-8 rounded-lg bg-white px-3 text-xs font-medium text-neutral-900 transition-colors hover:bg-white/85"
        >
          Pick up where you left off
        </button>
        <button
          type="button"
          onClick={() => setDismissedId(checkpoint.id)}
          className="no-drag h-8 rounded-lg px-3 text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
