import { useEffect, useMemo, useState } from 'react'
import type { Checkpoint } from '@core/memory'
import { createIdentitySpec, deriveIdentitySeed } from '@core/identity'
import { Globe } from '../ui/icons'
import { PixelTotem } from '@/features/identity'

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
 * Faint procedural pixel-totem backdrop, seeded deterministically from the
 * switch itself (Magic's identity style) so each prompt carries a quiet,
 * unique generative texture. It fills the light page surface behind the
 * dialog — not the dark dialog itself — fading into the white background
 * via its radial mask. The totem itself is drawn once (static, per
 * PixelTotem's no-idle-loop rule); the wrapper's one-shot opacity/scale
 * settle is the only motion.
 */
function TotemBackdrop({ checkpoint }: { checkpoint: Checkpoint }) {
  const spec = useMemo(
    () =>
      createIdentitySpec(
        deriveIdentitySeed([checkpoint.id, checkpoint.before.title, checkpoint.after.title, 'magic'])
      ),
    [checkpoint.id, checkpoint.before.title, checkpoint.after.title]
  )
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute right-[3%] top-1/2 -translate-y-1/2">
        <div
          className={`blur-[0.5px] [mask-image:radial-gradient(circle,black,transparent_72%)] ${
            settled ? 'scale-100 opacity-[0.25]' : 'scale-[1.04] opacity-0'
          } motion-safe:transition-[opacity,transform] motion-safe:duration-700 motion-safe:ease-out`}
        >
          <PixelTotem spec={spec} size={600} label="" />
        </div>
      </div>
    </div>
  )
}

/**
 * Startup recovery prompt built from the most recent workspace switch (the
 * newest Memory checkpoint): the muddled tab set left behind, the focus
 * mode it switched into, and the tabs that were open — so picking back up
 * is one click (`onResume` restores the Before side). Shown only at fresh
 * app open with no tabs open; the gating lives in startupRecovery.ts/App,
 * this component just renders the offer.
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
    <>
      {/* Sibling of the dialog, not a child: it layers over the light page
          surface around the card instead of being clipped inside it. */}
      <TotemBackdrop checkpoint={checkpoint} />
      <div className="relative w-full max-w-[520px] overflow-hidden rounded-xl bg-neutral-800 p-5 text-left text-white shadow-[0_8px_28px_rgb(0_0_0/0.28),0_0_0_0.5px_rgb(255_255_255/0.08)]">
        <div className="relative">
        <p className="text-sm leading-6">
          You switched from <span className="font-medium">“{before.title}”</span> to{' '}
          <span className="font-medium">“{after.title}”</span>. Do you want to pick up where you left off?
        </p>
        {shown.length > 0 && (
          <ul className="mt-4 flex flex-col divide-y divide-white/[0.06]">
            {shown.map((t) => (
              <li key={t.id} className="flex min-w-0 items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                {t.favicon ? (
                  <img src={t.favicon} alt="" draggable={false} className="h-4 w-4 shrink-0 rounded-sm" />
                ) : (
                  <Globe className="h-4 w-4 shrink-0 text-white/40" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs text-white/90">{t.title || hostOf(t.url)}</span>
                  <span className="truncate text-[11px] text-white/35">{hostOf(t.url)}</span>
                </span>
              </li>
            ))}
            {extra > 0 && (
              <li className="pt-2.5 text-[11px] text-white/40">
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
      </div>
    </>
  )
}
