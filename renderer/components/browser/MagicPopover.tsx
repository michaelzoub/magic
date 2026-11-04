import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { normalizeSiteExclusion, type AgentRunResult, type AgentStreamEvent } from '@shared/agent'
import { MAGIC_POPOVER_HEIGHT, type MagicContext, type MagicTab } from '@shared/overlay'
import { createIdentitySpec } from '@core/identity'
import { motion } from '@/motion'
import { PixelTotem } from '@/features/identity/PixelTotem'
import { MagicMark } from '../ui/Brand'
import { Button, buttonClasses } from '../ui/Button'
import { ArrowUpRight, ChevronRight, Close, Layers, Search, Settings, Sparkles } from '../ui/icons'
import { MarkdownText } from '../ui/Markdown'
import { surface, topmostSurfaceZ } from '../ui/surface'

/** The agent entity: a plain monochrome orb — no face, no animation. */
export function MagicOrb({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="block shrink-0 rounded-full bg-white"
      style={{ width: size, height: size }}
    />
  )
}

type ToolCallView = { id: string; name: string; input?: unknown; status: 'running' | string; error?: string }

export type ChatMessage = { role: 'user' | 'agent'; text: string; tools?: ToolCallView[]; streaming?: boolean }

const summarizeInput = (input: unknown): string => {
  if (input === undefined) return ''
  try {
    const text = typeof input === 'string' ? input : JSON.stringify(input)
    return text.length > 90 ? `${text.slice(0, 90)}…` : text
  } catch {
    return ''
  }
}

/** Fold one live stream event into the streaming agent message. */
const applyStreamEvent = (msg: ChatMessage, event: AgentStreamEvent): ChatMessage => {
  switch (event.type) {
    case 'text-delta':
      return { ...msg, text: msg.text + event.text }
    case 'tool-call': {
      const tools = [...(msg.tools ?? [])]
      const at = tools.findIndex((t) => t.id === event.id)
      const view: ToolCallView = { id: event.id, name: event.name, input: event.input, status: 'running' }
      if (at >= 0) tools[at] = { ...tools[at], ...view }
      else tools.push(view)
      return { ...msg, tools }
    }
    case 'tool-result': {
      const tools = (msg.tools ?? []).map((t) =>
        t.id === event.id ? { ...t, name: event.name ?? t.name, status: event.outcome, error: event.error } : t
      )
      return { ...msg, tools }
    }
  }
}

/** Strip Electron IPC wrapping so users see the failure, not the plumbing. */
const describeError = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err))
    .replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
    .replace(/^Error:\s*/, '') || 'the run failed'

/** Pause after the last keystroke before tab matches appear. */
const MATCH_COOLDOWN_MS = 250

const ghostButton = buttonClasses('secondary')
const sectionLabel = 'px-0.5 text-2xs font-medium text-white/40'

/**
 * One suggested prompt: a compact, borderless row on the dark surface —
 * small muted icon, title, and muted subtitle. Shown only in the empty
 * state; clicking sends the prompt as a user message.
 */
function SuggestionRow({ icon, title, subtitle, disabled, onClick }: {
  icon: ReactNode
  title: string
  subtitle: string
  disabled?: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5"
    >
      <span className="shrink-0 text-white/35 transition-colors group-hover:text-white/60">{icon}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="text-xs text-white/85">{title}</span>
        <span className="text-2xs text-white/35"> · {subtitle}</span>
      </span>
      <ArrowUpRight className="h-3 w-3 shrink-0 text-white/25 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

/**
 * Magic chat card (shell fallback + native overlay share it): the shared
 * charcoal `surface` used by every other popup/dialog in the project.
 * Simple: a header, the transcript (or, in the empty state, the user's
 * pixel totem above compact suggested prompts), and the input. The
 * height is fixed (`MAGIC_POPOVER_HEIGHT`), so
 * typing, tab matches, and streaming never resize the popover; the
 * transcript scrolls inside. Agent replies are plain text beside the
 * user's totem (animated while the agent is thinking, like the bottom
 * dock; asterisk mark without an identity), with tool activity as muted
 * grey rows above the reply.
 */
export function MagicPopoverContent({ context, onOpenTab, onResume, onAsk, onSetAssistance, onSetExclusions, onClose, initialMessages }: {
  context: MagicContext
  /** A persisted/restored conversation to reopen with, if any. */
  initialMessages?: ChatMessage[]
  /** Open a found tab (switching workspace first when needed); the caller closes the popover. */
  onOpenTab(tab: MagicTab): void
  /** Resume a saved workspace; the caller closes the popover. */
  onResume(workspaceId: string): void
  /** Send a chatbox question to the agent; streams live events, resolves with its reply. */
  onAsk(question: string, onEvent?: (event: AgentStreamEvent) => void): Promise<AgentRunResult>
  /** Toggle global background assistance. */
  onSetAssistance(active: boolean): void | Promise<void>
  /** Replace site/workspace exclusions. */
  onSetExclusions(excludedSites: string[], excludedWorkspaceIds: string[]): void | Promise<void>
  /** Undo a recorded reorganization by checkpoint id; the caller closes the popover. */
  onUndo(checkpointId: string): void
  /** Close the card (the × in the header); optional in embedders without one. */
  onClose?(): void
}) {
  const [query, setQuery] = useState('')
  const [showResume, setShowResume] = useState(false)
  const [showExclusions, setShowExclusions] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [siteDraft, setSiteDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages ?? [])
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  // The settings popup (anchored to the header gear) closes on an outside
  // pointerdown or Escape; the panels it opens stay open below.
  useEffect(() => {
    if (!showSettings) return
    const onDown = (e: PointerEvent) => {
      if (!settingsRef.current?.contains(e.target as Node)) setShowSettings(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowSettings(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showSettings])
  const assistance = context.assistance

  // Keep the newest chat message in view inside the scrolling middle
  // section (the input below it is pinned and never scrolls away).
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending])
  const isEmptyConversation = messages.length === 0

  // The user's totem, rebuilt from its seed — the same identity the bottom
  // dock animates while a switch run is thinking.
  const identity = useMemo(() => {
    if (!context.identitySeed) return null
    try {
      return createIdentitySpec(context.identitySeed)
    } catch {
      return null
    }
  }, [context.identitySeed])

  // Quick tab matches stay available as one-click shortcuts, but submitting
  // the input always asks the agent — never a local-only answer.
  //
  // Cooldown: matches are computed from the query only after typing has
  // paused for MATCH_COOLDOWN_MS. Matching on every keystroke made the
  // list flicker/reshape mid-word; now it appears once, when the user
  // pauses, and animates in (see the matches list below).
  const [cooldownQuery, setCooldownQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setCooldownQuery(query), MATCH_COOLDOWN_MS)
    return () => clearTimeout(t)
  }, [query])
  const matches = useMemo(() => {
    // Still typing (cooldown not yet elapsed for this exact query): show
    // nothing rather than stale matches for a half-finished word.
    if (cooldownQuery !== query) return []
    const q = query.trim().toLowerCase()
    if (!q) return []
    return context.tabs
      .filter((t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q) || t.workspaceName.toLowerCase().includes(q))
      .slice(0, 5)
  }, [query, cooldownQuery, context.tabs])
  const matchesRef = useRef<HTMLUListElement>(null)
  // GSAP entrance each time a fresh set of matches lands after a pause.
  useEffect(() => {
    if (matches.length > 0 && matchesRef.current) motion.listIn(matchesRef.current)
  }, [matches])

  /**
   * Send one user message and stream the agent reply into the bubble after
   * it. The form and the suggested prompts both go through here, so picking
   * a suggestion behaves exactly like typing and sending it.
   */
  const sendMessage = async (rawText: string) => {
    const text = rawText.trim()
    if (!text || pending) return
    // The streaming agent bubble sits right after this user message; stream
    // events fold into it in place until the final result replaces its text.
    const agentIndex = messages.length + 1
    let streamed = ''
    const onEvent = (event: AgentStreamEvent) => {
      if (event.type === 'text-delta') streamed += event.text
      setMessages((m) => m.map((msg, i) => (i === agentIndex ? applyStreamEvent(msg, event) : msg)))
    }
    setMessages((m) => [...m, { role: 'user', text }, { role: 'agent', text: '', tools: [], streaming: true }])
    setQuery('')
    setNotice(null)
    setShowResume(false)
    setPending(true)
    const settle = (finalText: string) =>
      setMessages((m) => m.map((msg, i) => (i === agentIndex ? { ...msg, text: finalText, streaming: false } : msg)))
    try {
      const result = await onAsk(text, onEvent)
      const fallback =
        result.status === 'skipped'
          ? `Magic is unavailable: ${result.reason ?? 'agent not running'}`
          : result.status === 'failed'
            ? `Magic could not finish: ${result.reason ?? 'the run failed'}`
            : 'Done.'
      settle(result.reply ?? (streamed.trim() || fallback))
    } catch (err) {
      settle(streamed.trim() ? `${streamed.trim()}\n\nMagic could not finish: ${describeError(err)}` : `Magic could not finish: ${describeError(err)}`)
    } finally {
      setPending(false)
      inputRef.current?.focus()
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void sendMessage(query)
  }

  return (
    <div
      className={`flex flex-col gap-3 p-4 ${surface}`}
      style={{ height: `min(${MAGIC_POPOVER_HEIGHT}px, calc(100vh - 16px))` }}
    >
      <div className="flex shrink-0 items-center gap-2 px-0.5 pt-0.5">
        <div className="text-sm font-medium leading-tight tracking-[-0.01em] text-white">
          {isEmptyConversation ? 'New Chat' : 'Chat'}
        </div>
        <div ref={settingsRef} className="relative ml-auto shrink-0">
          <button
            type="button"
            aria-label="Settings"
            aria-haspopup="menu"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((v) => !v)}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-[6px] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${showSettings ? 'bg-white/10 text-white' : 'text-white/55'}`}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          {showSettings && (
            <div
              role="menu"
              aria-label="Settings"
              className={`absolute right-0 top-full ${topmostSurfaceZ} mt-1.5 w-44 rounded-lg p-1 ring-1 ring-white/10 ${surface}`}
            >
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={assistance.active}
                onClick={() => void onSetAssistance(!assistance.active)}
                className="flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-xs text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              >
                Background assistance
                <span className="text-2xs text-white/35">{assistance.active ? 'On' : 'Off'}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                aria-expanded={showResume}
                onClick={() => (setShowResume((v) => !v), setShowSettings(false))}
                className="flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-xs text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              >
                Saved workspaces
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30" />
              </button>
              <button
                type="button"
                role="menuitem"
                aria-expanded={showExclusions}
                onClick={() => (setShowExclusions((v) => !v), setShowSettings(false))}
                className="flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-xs text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              >
                Exclusions
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30" />
              </button>
            </div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close chat"
            onClick={onClose}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            <Close className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Scrolling middle: pinned header above, pinned input below. The
          popover height is fixed, so this area absorbs all growth —
          typing, tab matches, and streaming never resize the panel. */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {isEmptyConversation && !showExclusions && !showResume && (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-col items-center gap-2.5 pb-7 pt-12 text-center">
            {identity ? (
              <PixelTotem spec={identity} size={44} className="rounded-[8px]" />
            ) : (
              <MagicOrb size={28} />
            )}
            <p className="text-xs text-white/35">Ask a question or give a task.</p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <div className={sectionLabel}>Suggestions</div>
            <div className="flex shrink-0 flex-col">
              {[
                {
                  key: 'organize',
                  icon: <Sparkles />,
                  title: 'Organize my tabs',
                  subtitle: context.workspace ? `Tidy tabs in ${context.workspace.name}` : 'Tidy your tabs',
                  prompt: 'Organize my tabs'
                },
                {
                  key: 'resume',
                  icon: <Layers />,
                  title: 'Resume my work',
                  subtitle: context.resumable.length > 0 ? `${context.resumable.length} saved workspace${context.resumable.length === 1 ? '' : 's'}` : 'No saved work yet',
                  prompt: context.workspace ? `Resume my work in ${context.workspace.name}` : 'Resume my work'
                },
                {
                  key: 'find',
                  icon: <Search />,
                  title: 'Help me find a tab',
                  subtitle: `${context.tabs.length} tab${context.tabs.length === 1 ? '' : 's'} in context`,
                  prompt: 'Help me find a tab'
                }
              ].map((action) => (
                <SuggestionRow
                  key={action.key}
                  icon={action.icon}
                  title={action.title}
                  subtitle={action.subtitle}
                  disabled={pending}
                  onClick={() => void sendMessage(action.prompt)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      {showExclusions && (
        <div className="flex flex-col gap-2.5">
          <div>
            <div className={sectionLabel}>Excluded sites</div>
            <form
              className="mt-1.5 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                const site = normalizeSiteExclusion(siteDraft)
                if (!site) return setNotice('Enter a site like example.com.')
                void onSetExclusions([...assistance.excludedSites, site], assistance.excludedWorkspaceIds)
                setSiteDraft('')
              }}
            >
              <input
                value={siteDraft}
                onChange={(e) => setSiteDraft(e.currentTarget.value)}
                placeholder="example.com"
                aria-label="Add excluded site"
                className="h-7 min-w-0 flex-1 rounded-[6px] bg-white/[0.06] px-2.5 text-xs text-white placeholder:text-white/35 outline-none ring-1 ring-white/[0.06] focus:ring-white/40"
              />
              <button type="submit" className={ghostButton}>
                Add
              </button>
            </form>
            {assistance.excludedSites.map((site) => (
              <div key={site} className="mt-1 flex items-center justify-between px-0.5 py-0.5">
                <span className="truncate text-xs text-white/80">{site}</span>
                <button
                  type="button"
                  aria-label={`Remove ${site} exclusion`}
                  onClick={() => void onSetExclusions(assistance.excludedSites.filter((s) => s !== site), assistance.excludedWorkspaceIds)}
                  className="rounded-[6px] px-1.5 py-0.5 text-2xs text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div>
            <div className={sectionLabel}>Excluded workspaces</div>
            {context.workspaces.map((w) => {
              const excluded = assistance.excludedWorkspaceIds.includes(w.id)
              return (
                <label key={w.id} className="mt-1 flex cursor-pointer items-center gap-2 px-0.5 py-0.5 text-xs text-white/80">
                  <input
                    type="checkbox"
                    checked={excluded}
                    onChange={() =>
                      void onSetExclusions(
                        assistance.excludedSites,
                        excluded ? assistance.excludedWorkspaceIds.filter((id) => id !== w.id) : [...assistance.excludedWorkspaceIds, w.id]
                      )
                    }
                    className="accent-white"
                  />
                  <span className="truncate">{w.name}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}


      {!isEmptyConversation && (
        <div className="flex flex-col gap-4" aria-live="polite">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div
                key={i}
                className="max-w-[85%] self-end whitespace-pre-wrap rounded-lg bg-white/[0.08] px-3 py-2 text-sm leading-relaxed text-white/90 [overflow-wrap:anywhere]"
              >
                {m.text}
              </div>
            ) : (
              <div key={i} className="flex gap-2.5 self-stretch">
                {identity ? (
                  <PixelTotem spec={identity} size={28} thinking={!!m.streaming} label={m.streaming ? 'Your totem, thinking' : undefined} className="mt-0.5 shrink-0 rounded-[6px]" />
                ) : (
                  <MagicMark size={14} className="mt-1 shrink-0 text-white/40" />
                )}
                <div className="min-w-0 flex-1">
                  {m.tools && m.tools.length > 0 && (
                    <ul className="mb-2 flex flex-col gap-1.5">
                      {m.tools.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-xs leading-tight text-white/45">
                          <span
                            aria-hidden="true"
                            className={`shrink-0 ${t.status === 'running' ? 'animate-pulse text-white/40' : t.status === 'completed' ? 'text-emerald-300' : 'text-red-300'}`}
                          >
                            {t.status === 'running' ? '◌' : t.status === 'completed' ? '✓' : '✗'}
                          </span>
                          <span className="shrink-0">{t.name.replace(/_/g, ' ')}</span>
                          {summarizeInput(t.input) && <span className="truncate text-white/25">{summarizeInput(t.input)}</span>}
                          {t.error && <span className="truncate text-red-300">{t.error}</span>}
                          <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-white/25" />
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.text && <MarkdownText text={m.text} className="text-sm leading-relaxed text-white/85" />}
                  {m.streaming && !m.text && (
                    <p role="status" className="flex items-center gap-2 py-0.5">
                      {/* The animated totem beside this line (same as the
                          bottom dock) carries the thinking state; without an
                          identity, fall back to pulsing dots. The label
                          itself shimmers (see .thinking-shimmer). */}
                      {!identity && (
                        <span aria-hidden="true" className="flex items-center gap-1">
                          {[0, 1, 2].map((dot) => (
                            <span key={dot} className="h-1 w-1 animate-pulse rounded-full bg-white/35" style={{ animationDelay: `${dot * 160}ms` }} />
                          ))}
                        </span>
                      )}
                      <span className="thinking-shimmer text-sm">{m.tools?.some((t) => t.status === 'running') ? 'Working…' : 'Thinking…'}</span>
                    </p>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {matches.length > 0 && (
        <ul ref={matchesRef} className="flex flex-col">
          {matches.map((t) => (
            <li key={`${t.workspaceId ?? ''}:${t.id}`} data-animate-item>
              <button
                type="button"
                onClick={() => onOpenTab(t)}
                className="flex w-full flex-col gap-0.5 rounded-[6px] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              >
                <span className="truncate text-xs text-white/90">{t.title || t.url}</span>
                <span className="flex min-w-0 items-center gap-2 text-2xs text-white/40">
                  <span className="shrink-0">{t.workspaceName}</span>
                  <span className="min-w-0 truncate">{t.url}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showResume && (
        <div className="flex flex-col gap-1 rounded-lg bg-white/[0.04] p-1.5 ring-1 ring-white/[0.06]">
          {context.resumable.length === 0 ? (
            <p className="px-2 py-1.5 text-2xs text-white/40">No saved work to resume yet.</p>
          ) : (
            context.resumable.map((r) => (
              <button
                key={r.workspaceId}
                type="button"
                onClick={() => onResume(r.workspaceId)}
                className="flex w-full flex-col gap-0.5 rounded-[6px] bg-white/[0.06] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.09]"
              >
                <span className="truncate text-xs text-white/90">{r.workspaceName}</span>
                <span className="flex min-w-0 items-center gap-2 text-2xs text-white/40">
                  <span className="shrink-0">
                    {r.tabCount} tab{r.tabCount === 1 ? '' : 's'}
                  </span>
                  {r.activeTabTitle && <span className="min-w-0 truncate">{r.activeTabTitle}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {notice && <p className="px-0.5 pb-0.5 text-2xs text-white/45">{notice}</p>}
      </div>

      <form onSubmit={submit} className="mt-1 shrink-0 pt-3.5">
        <div className="flex items-center gap-1.5 rounded-[6px] bg-white/[0.06] p-1 ring-1 ring-white/[0.06] transition-shadow focus-within:ring-white/40">
          <input
            aria-label="Ask Magic anything"
            ref={inputRef}
            autoFocus
            disabled={pending}
            value={query}
            onChange={(e) => (setQuery(e.currentTarget.value), setNotice(null))}
            placeholder="Ask a question or give a task…"
            className="min-w-0 flex-1 bg-transparent px-2.5 py-1 text-sm text-white placeholder:text-white/35 outline-none disabled:opacity-50"
          />
          <Button type="submit" variant="secondary" disabled={pending || !query.trim()}>
            {pending ? 'Working…' : 'Ask'}
          </Button>
        </div>
      </form>
    </div>
  )
}
