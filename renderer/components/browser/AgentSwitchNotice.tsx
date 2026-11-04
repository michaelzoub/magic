import { useEffect, useRef, useState } from 'react'
import type { AgentSwitchNoticeState, AgentTabProposal } from '@shared/agent'
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
export function AgentSwitchNotice({ notice, onApply, onDismiss }: {
  notice: AgentSwitchNoticeState
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

  const groups = groupProposals(notice.proposals)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-3">
      <div
        ref={panelRef}
        role="status"
        aria-live="polite"
        className={`no-drag pointer-events-auto max-h-[calc(100vh-24px)] w-[448px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg p-3 ${surface}`}
      >
        <div className="flex items-center gap-2">
          {running && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white/70" />}
          <div className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
            {running ? `Preparing layout for ${notice.toName}` : `Proposed layout for ${notice.toName}`}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => leave(onDismiss)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Close className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Agent traces are live-run state only: once the run concludes
            (proposed/failed/skipped) they give way to the outcome below. */}
        {running && notice.traces.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {notice.traces.slice(-5).map((trace, i, all) => (
              <li key={`${i}-${trace}`} className={`truncate text-xs leading-tight ${i === all.length - 1 ? 'text-white/80' : 'text-white/40'}`}>
                {trace}
              </li>
            ))}
          </ul>
        )}

        {running && notice.traces.length === 0 && <p className="mt-2 animate-pulse text-xs text-white/40">Starting…</p>}

        {notice.phase === 'failed' && <p className="mt-2 text-xs text-red-300">{notice.reason ?? 'The run failed.'}</p>}
        {notice.phase === 'skipped' && <p className="mt-2 text-xs text-white/50">{notice.reason ?? 'The run was skipped.'}</p>}

        {notice.phase === 'done' && !hasProposals && (
          <>
            {notice.reply && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-snug text-white/60">{notice.reply}</p>}
            <p className="mt-2 text-2xs text-white/40">No tab changes proposed — your tabs are unchanged.</p>
          </>
        )}

        {hasProposals && (
          <>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {groups.map((group) => (
                <div key={group.kind}>
                  <div className="flex items-center gap-1.5 px-0.5 text-2xs font-medium text-white/40">
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
                            className={`flex w-full items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-left transition-colors ${
                              isSelected ? 'bg-white/[0.06] hover:bg-white/[0.09]' : 'bg-transparent hover:bg-white/[0.04]'
                            }`}
                          >
                            <Globe className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-white/40' : 'text-white/20'}`} />
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-xs leading-tight ${isSelected ? 'text-white/90' : 'text-white/35 line-through decoration-white/25'}`}>{detail.title}</span>
                              {detail.detail && detail.detail !== detail.title && (
                                <span className={`block truncate text-2xs leading-tight ${isSelected ? 'text-white/35' : 'text-white/20'}`}>{detail.detail}</span>
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

            <div className="mt-2.5">
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
                <p className="mt-1.5 whitespace-pre-wrap px-0.5 text-xs leading-snug text-white/60">
                  {notice.reply ?? `These tabs were matched to the “${notice.toName}” workspace goal.`}
                </p>
              )}
            </div>

            <div className="mt-2.5 flex gap-1.5">
              <Button
                variant="primary"
                size="md"
                disabled={selectedProposals.length === 0}
                onClick={() => leave(() => onApply(selectedProposals))}
              >
                Apply changes{selectedProposals.length !== notice.proposals.length ? ` (${selectedProposals.length})` : ''}
              </Button>
              <Button variant="secondary" onClick={() => leave(onDismiss)}>
                Not now
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
