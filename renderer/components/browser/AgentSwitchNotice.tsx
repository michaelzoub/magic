import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentSwitchNoticeState, AgentTabProposal } from '@shared/agent'
import { createIdentitySpec } from '@core/identity'
import { PixelTotem } from '@/features/identity/PixelTotem'
import { describeProposalDetail, groupProposals } from './agentNotice'
import { ArrowUpRight, Check, ChevronDown, Close, Globe, Plus, Trash } from '../ui/icons'
import { surface } from '../ui/surface'
import { Button } from '../ui/Button'
import { motion } from '@/motion'

const groupIcon = (kind: AgentTabProposal['kind']) => {
  switch (kind) {
    case 'open':
      return <Plus className="h-3.5 w-3.5" />
    case 'navigate':
      return <ArrowUpRight className="h-3.5 w-3.5" />
    case 'close':
      return <Trash className="h-3.5 w-3.5" />
  }
}

/**
 * Dock-style sheet for a workspace-switch agent run, anchored bottom-center:
 * appears as soon as the run starts, shows its important traces live, and —
 * when it concludes with staged tab changes — asks the user to apply or
 * dismiss them instead of enacting them automatically. Dark `surface`
 * styling matches Magic's other popups; entrance/exit is a short upward
 * slide + fade via `motion.dockIn`/`dockOut`.
 */
export function AgentSwitchNotice({ notice, onApply, onDismiss, onHeight }: {
  notice: AgentSwitchNoticeState
  /**
   * Native overlay host: called with the panel's rendered height so the
   * layer can shrink to it. When set, the panel's max height is fixed
   * rather than viewport-relative (the viewport *is* the layer, so a
   * vh cap would never let the panel grow).
   */
  onHeight?(px: number): void
  /** Apply only the proposals the user left selected. */
  onApply(proposals: AgentTabProposal[]): void
  onDismiss(): void
}) {
  const running = notice.phase === 'running'
  const hasProposals = notice.phase === 'done' && notice.proposals.length > 0
  const [whyOpen, setWhyOpen] = useState(false)
  // Selected proposal indexes (into notice.proposals); all start selected,
  // and clicking a proposal row toggles it out of — or back into — the apply set.
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  useEffect(() => {
    setSelected(new Set(notice.proposals.map((_, i) => i)))
  }, [notice.id, notice.proposals])
  const toggleProposal = (index: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  const selectedProposals = notice.proposals.filter((_, i) => selected.has(i))
  const panelRef = useRef<HTMLDivElement>(null)
  const leaving = useRef(false)

  // Entrance once per run; a new run (new id) replays it.
  useEffect(() => {
    leaving.current = false
    if (panelRef.current) motion.dockIn(panelRef.current)
  }, [notice.id])

  /** Animate out, then hand off to the caller's apply/dismiss handling. */
  const leave = (action: () => void) => {
    if (leaving.current) return
    leaving.current = true
    motion.dockOut(panelRef.current, action)
  }

  // Report the panel's height (including its 12px bottom inset) as it
  // changes; the element swaps between the running and concluded layouts.
  useEffect(() => {
    const el = panelRef.current
    if (!onHeight || !el) return
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight))
    ro.observe(el)
    onHeight(el.offsetHeight)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, !!onHeight])

  const groups = groupProposals(notice.proposals)
  const identity = useMemo(() => {
    if (!notice.identitySeed) return null
    try {
      return createIdentitySpec(notice.identitySeed)
    } catch {
      return null
    }
  }, [notice.identitySeed])
  const latestTrace = notice.traces[notice.traces.length - 1]
  const traceListRef = useRef<HTMLUListElement>(null)

  // Keep the newest status in view as traces arrive; older ones stay
  // reachable by scrolling up in the list.
  useEffect(() => {
    const el = traceListRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [notice.traces])

  // In the loop: a compact dock in the shared charcoal `surface` (same
  // black as the concluded sheet below) — the user's totem animated via
  // PixelTotem's `thinking` cycle, a palette glow bleeding out below it,
  // and the full status history as a scrollable list, newest last. The
  // proposal sheet below only returns once the run concludes.
  if (running) {
    const glow = identity ? identity.palette.colors.slice(1) : ['#6366f1', '#ec4899', '#f59e0b']
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3">
        <div ref={panelRef} role="status" aria-live="polite" aria-label={latestTrace ? `Thinking: ${latestTrace}` : 'Thinking'} className="no-drag pointer-events-auto relative w-[448px] max-w-[calc(100vw-24px)]">
          <div
            aria-hidden="true"
            className="absolute inset-x-3 -bottom-2 h-7 rounded-lg opacity-60 blur-xl animate-pulse"
            style={{ background: `linear-gradient(90deg, ${glow.join(', ')})` }}
          />
          <div className={`relative rounded-lg p-3 ring-1 ring-white/10 ${surface}`}>
            <div className="flex items-center gap-2.5">
              {identity ? (
                <PixelTotem spec={identity} size={34} thinking label="Your totem, thinking" className="shrink-0 rounded-[6px]" />
              ) : (
                <span aria-hidden="true" className="ml-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-white/80" />
              )}
              <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-clip text-base font-medium leading-tight">Thinking</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => leave(onDismiss)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              >
                <Close className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul ref={traceListRef} aria-label="Agent status" className="mt-2 flex max-h-[7.5rem] flex-col gap-1 overflow-y-auto pr-1">
              {notice.traces.length > 0 ? (
                notice.traces.map((trace, i, all) => (
                  <li key={`${i}-${trace}`} className={`overflow-hidden whitespace-nowrap text-clip text-xs leading-tight ${i === all.length - 1 ? 'text-white/85' : 'text-white/40'}`}>
                    {trace}
                  </li>
                ))
              ) : (
                <li className="overflow-hidden whitespace-nowrap text-clip text-xs leading-tight text-white/40">{`Preparing ${notice.toName}`}</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3">
      <div
        ref={panelRef}
        role="status"
        aria-live="polite"
        className={`no-drag pointer-events-auto flex ${onHeight ? 'max-h-[736px]' : 'max-h-[calc(100vh-24px)]'} w-[448px] max-w-[calc(100vw-24px)] flex-col rounded-lg p-3 ring-1 ring-white/10 ${surface}`}
      >
        <div className="flex shrink-0 items-center gap-2">
          {running && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white/70" />}
          <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-clip text-sm font-medium leading-tight">
            {running ? `Preparing layout for ${notice.toName}` : `Proposed layout for ${notice.toName}`}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => leave(onDismiss)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            <Close className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Agent traces are live-run state only: once the run concludes
            (proposed/failed/skipped) they give way to the outcome below. */}
        {running && notice.traces.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {notice.traces.slice(-5).map((trace, i, all) => (
              <li key={`${i}-${trace}`} className={`overflow-hidden whitespace-nowrap text-clip text-xs leading-tight ${i === all.length - 1 ? 'text-white/80' : 'text-white/40'}`}>
                {trace}
              </li>
            ))}
          </ul>
        )}

        {running && notice.traces.length === 0 && <p className="mt-2 animate-pulse text-xs text-white/40">Starting</p>}

        {notice.phase === 'failed' && <p className="mt-2 text-xs text-red-300">{notice.reason ?? 'The run failed.'}</p>}
        {notice.phase === 'skipped' && <p className="mt-2 text-xs text-white/50">{notice.reason ?? 'The run was skipped.'}</p>}

        {notice.phase === 'done' && !hasProposals && (
          <>
            {notice.reply && <p className="mt-2 whitespace-pre-wrap text-xs leading-snug text-white/60">{notice.reply}</p>}
            <p className="mt-2 text-2xs text-white/40">No tab changes proposed — your tabs are unchanged.</p>
          </>
        )}

        {hasProposals && (
          <>
            <div className="mt-2.5 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
              {groups.map((group) => (
                <div key={group.kind}>
                  <div className="flex items-center gap-1.5 px-0.5 text-2xs font-medium uppercase tracking-[0.06em] text-white/40">
                    <span aria-hidden="true" className="grid h-4 w-4 place-items-center text-white/50">{groupIcon(group.kind)}</span>
                    {group.label}
                    <span className="text-white/30">{group.proposals.length}</span>
                  </div>
                  <ul className="mt-1 flex flex-col gap-1">
                    {group.proposals.map((p) => {
                      const detail = describeProposalDetail(p)
                      const index = notice.proposals.indexOf(p)
                      const isSelected = selected.has(index)
                      return (
                        <li key={index}>
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            aria-label={`${isSelected ? 'Deselect' : 'Select'}: ${detail.title}`}
                            onClick={() => toggleProposal(index)}
                            className={`flex w-full items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-left ring-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${
                              isSelected ? 'bg-white/[0.07] ring-white/[0.08] hover:bg-white/[0.10]' : 'ring-transparent hover:bg-white/[0.04]'
                            }`}
                          >
                            <Globe className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-white/40' : 'text-white/20'}`} />
                            <span className="min-w-0 flex-1">
                              <span className={`block overflow-hidden whitespace-nowrap text-clip text-xs leading-tight ${isSelected ? 'text-white/90' : 'text-white/35 line-through decoration-white/25'}`}>{detail.title}</span>
                              {detail.detail && detail.detail !== detail.title && (
                                <span className={`block overflow-hidden whitespace-nowrap text-clip text-2xs leading-tight ${isSelected ? 'text-white/35' : 'text-white/20'}`}>{detail.detail}</span>
                              )}
                            </span>
                            <span
                              aria-hidden="true"
                              className={`grid h-4 w-4 shrink-0 place-items-center rounded-[4px] transition-colors ${
                                isSelected ? 'bg-white text-neutral-900' : 'bg-white/[0.15] text-transparent'
                              }`}
                            >
                              <Check className="h-3 w-3" />
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-2.5 shrink-0">
              <button
                type="button"
                aria-expanded={whyOpen}
                onClick={() => setWhyOpen((v) => !v)}
                className="flex items-center gap-1 px-0.5 text-2xs text-white/50 transition-colors hover:text-white/80"
              >
                Why these changes?
                <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${whyOpen ? 'rotate-180' : ''}`} />
              </button>
              {whyOpen && (
                <p className="mt-1.5 whitespace-pre-wrap rounded-[6px] bg-white/[0.04] px-2 py-1.5 text-xs leading-snug text-white/65 ring-1 ring-white/[0.06]">
                  {notice.reply ?? `These tabs were matched to the “${notice.toName}” workspace goal.`}
                </p>
              )}
            </div>

            <div className="mt-3 flex shrink-0 gap-1.5 border-t border-white/[0.07] pt-2.5">
              <Button
                variant="primary"
                className="flex-1"
                disabled={selectedProposals.length === 0}
                onClick={() => leave(() => onApply(selectedProposals))}
              >
                Apply changes{` (${selectedProposals.length}/${notice.proposals.length})`}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => leave(onDismiss)}>
                Not now
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
