import { useState } from 'react'
import type { FormEvent } from 'react'
import { Globe, Search } from '../ui/icons'
import { Button } from '../ui/Button'

export interface NewTabRecentItem {
  /** Live tab id when the item is already open; absent for saved-only items. */
  id?: string
  title: string
  url: string
  favicon?: string
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Blank-tab home: browse-first, not agent-first. No prompt asks the user to
 * articulate a task — the page opens on the same search/address box as the
 * URL bar (addresses navigate, anything else becomes a search via the
 * engine's `normalizeInput`), the active workspace named underneath, and
 * the workspace's recently used tabs as one-click chips below. Asking Magic
 * stays explicit, in the Magic popover, never the default for typed text.
 * Shown by `Viewport` whenever the active tab has no URL.
 */
export function NewTabPage({ workspaceName, switchStats, recent, onNavigate, onOpenRecent, onViewAll }: {
  workspaceName?: string | null
  /** Workspace-mode switch counts; omitted when no history is loaded yet. */
  switchStats?: { today: number; pastWeek: number }
  recent: NewTabRecentItem[]
  /** Addresses navigate; other text is searched by the engine. */
  onNavigate(input: string): void
  onOpenRecent(item: NewTabRecentItem): void
  onViewAll(): void
}) {
  const [value, setValue] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (text) onNavigate(text)
  }

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col px-5 pb-8 pt-[7vh]">
      <h1 className="sr-only">New tab</h1>

      <form
        onSubmit={submit}
        className="no-drag flex h-10 items-center gap-2 rounded-lg bg-chrome-bg px-3 transition-[box-shadow] duration-100 focus-within:shadow-[0_0_0_2px_rgb(var(--chrome-focus)/0.45)]"
      >
        <Search className="h-4 w-4 shrink-0 text-chrome-faint" />
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          placeholder="Search or enter address"
          aria-label="Search or enter address"
          spellcheck={false}
          className="min-w-0 flex-1 bg-transparent text-base text-chrome-text outline-none placeholder:text-chrome-faint"
        />
      </form>

      {workspaceName && <p className="mt-2.5 text-center text-xs text-chrome-muted">In {workspaceName}</p>}

      {switchStats && (
        <section aria-label="Workspace switch activity" className="mt-5">
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: switchStats.today, label: 'Workspace switches today' },
              { value: switchStats.pastWeek, label: 'Switches in the past 7 days' }
            ].map((stat) => (
              <div key={stat.label} className="flex items-baseline gap-2 rounded-lg bg-chrome-bg px-3 py-2">
                <p className="text-lg font-semibold leading-none tracking-[-0.01em] text-chrome-text">{stat.value}</p>
                <p className="text-xs leading-snug text-chrome-muted">{stat.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-chrome-faint">
            {switchStats.today === 0
              ? 'No workspace switches yet today.'
              : `You've switched workspaces ${switchStats.today} ${switchStats.today === 1 ? 'time' : 'times'} today, ${switchStats.pastWeek} ${switchStats.pastWeek === 1 ? 'time' : 'times'} in the past 7 days.`}
          </p>
        </section>
      )}

      <div className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-medium text-chrome-text">Recently used in this workspace</h2>
          <Button variant="chromeGhost" onClick={onViewAll}>
            View all
          </Button>
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-chrome-faint">Nothing here yet — open a site to get started.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {recent.map((item) => (
              <li key={`${item.id ?? ''}:${item.url}`}>
                <button
                  type="button"
                  onClick={() => onOpenRecent(item)}
                  title={item.url}
                  className="no-drag flex h-8 max-w-[260px] items-center gap-2 rounded-[6px] bg-chrome-bg py-0 pl-2.5 pr-3 transition-colors duration-100 hover:bg-chrome-hover/[0.06]"
                >
                  {item.favicon ? (
                    <img src={item.favicon} alt="" draggable={false} className="h-4 w-4 shrink-0 rounded-sm" />
                  ) : (
                    <Globe className="h-4 w-4 shrink-0 text-chrome-muted" />
                  )}
                  <span className="truncate text-sm text-chrome-text">{item.title || hostOf(item.url)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
