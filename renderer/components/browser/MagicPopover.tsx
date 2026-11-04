import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { normalizeSiteExclusion, type AgentRunResult, type AgentStreamEvent } from '@shared/agent'
import type { MagicContext, MagicTab } from '@shared/overlay'
import { MagicMark } from '../ui/Brand'
import { Chip } from '../ui/Chip'
import { Button, buttonClasses } from '../ui/Button'
import { ChevronRight, Close, Layers, Search, Settings, Sparkles } from '../ui/icons'
import { MarkdownText } from '../ui/Markdown'

/** The agent entity: a plain monochrome orb — no face, no animation. */
export function MagicOrb({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="block shrink-0 rounded-full bg-neutral-900"
      style={{ width: size, height: size }}
    />
  )
}

type ToolCallView = { id: string; name: string; input?: unknown; status: 'running' | string; error?: string }

type ChatMessage = { role: 'user' | 'agent'; text: string; tools?: ToolCallView[]; streaming?: boolean }

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

const ghostButton = buttonClasses('light')
const sectionLabel = 'px-0.5 text-2xs font-medium text-neutral-400'

/**
 * One recommended action, in the saved-context card style: a dark icon
 * tile, a title, and a muted subtitle on a white card with a soft shadow.
 * Toggle actions carry a chevron that turns down while their panel is
 * open below the section.
 */
function ActionCard({ icon, title, subtitle, onClick, expanded }: {
  icon: ReactNode
  title: string
  subtitle: string
  onClick(): void
  /** Set for toggle actions; left undefined for immediate actions. */
  expanded?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={`flex w-full items-center gap-2.5 rounded-lg bg-white px-3 py-2 text-left shadow-[0_2px_8px_rgb(0_0_0/0.10)] transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${expanded ? 'bg-neutral-50' : ''}`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-neutral-900 text-white [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium leading-tight text-neutral-800">{title}</span>
        <span className="block truncate text-2xs leading-tight text-neutral-400">{subtitle}</span>
      </span>
      {expanded !== undefined && (
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-neutral-300 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      )}
    </button>
  )
}

/**
 * Magic chat card (shell fallback + native overlay share it), modelled on a
 * light chat sheet: a white, generously rounded card with a "New Chat"
 * header, recommended actions in the saved-context card style, charcoal
 * user bubbles, and agent replies as plain text beside the asterisk mark —
 * tool activity collapses into muted grey rows above the reply. Every
 * question submitted goes to the agent, which thinks, may drive the
 * browser with its tools, and replies in the transcript.
 */
export function MagicPopoverContent({ context, onOpenTab, onResume, onAsk, onSetAssistance, onSetExclusions, onUndo, onClose }: {
  context: MagicContext
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
  const [showActivity, setShowActivity] = useState(false)
  const [showExclusions, setShowExclusions] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // Recommended actions as an overlapping deck (back cards peek out above
  // the front one): ordered back-to-front, so the last key is the front
  // card. Clicking any card fills the input with its prompt; clicking a
  // peeking card also brings it to the front.
  const [deck, setDeck] = useState<Array<'find' | 'resume' | 'organize'>>(['organize', 'resume', 'find'])
  const [siteDraft, setSiteDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState(false)
  // Fake save on open (placeholder until a real context-save status exists):
  // the header chip spins on "Saving…" briefly, then settles on "Context
  // saved". Both popover hosts unmount this content on close, so the state
  // — and the animation — restarts every time the popup opens.
  const [contextSaving, setContextSaving] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setContextSaving(false), 900)
    return () => clearTimeout(t)
  }, [])
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
  const latestUndo = context.activity.find((a) => a.checkpointId)

  /** Fill the chat input with a suggested prompt and put the cursor at the end. */
  const fillPrompt = (text: string) => {
    setQuery(text)
    setNotice(null)
    setTimeout(() => {
      const el = inputRef.current
      el?.focus()
      el?.setSelectionRange(text.length, text.length)
    }, 0)
  }

  // Quick tab matches stay available as one-click shortcuts, but submitting
  // the input always asks the agent — never a local-only answer.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return context.tabs
      .filter((t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q) || t.workspaceName.toLowerCase().includes(q))
      .slice(0, 5)
  }, [query, context.tabs])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = query.trim()
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

  return (
    <div className="flex max-h-[min(78vh,calc(100vh-16px))] flex-col gap-3 bg-white p-4 text-neutral-900">
      <div className="flex shrink-0 items-center gap-2 px-0.5 pt-0.5">
        <div className="text-lg font-medium leading-tight tracking-[-0.01em] text-neutral-800">
          {messages.length > 0 ? 'Chat' : 'New Chat'}
        </div>
        <Chip variant="light" className="ml-auto min-w-[102px] justify-center">
          <span role="status" aria-live="polite" className="inline-flex items-center gap-1">
            {contextSaving ? (
              <>
                <span aria-hidden="true" className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-neutral-300 border-t-neutral-500" />
                Saving…
              </>
            ) : (
              <>
                <MagicMark size={9} className="shrink-0 text-neutral-400" />
                Context saved
              </>
            )}
          </span>
        </Chip>
        <div ref={settingsRef} className="relative shrink-0">
          <button
            type="button"
            aria-label="Settings"
            aria-haspopup="menu"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((v) => !v)}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-[6px] transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${showSettings ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500'}`}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          {showSettings && (
            <div
              role="menu"
              aria-label="Settings"
              className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-lg bg-white p-1 shadow-[0_12px_32px_rgb(0_0_0/0.16)] ring-1 ring-black/5"
            >
              <button
                type="button"
                role="menuitem"
                aria-expanded={showActivity}
                onClick={() => (setShowActivity((v) => !v), setShowSettings(false))}
                className="flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-xs text-neutral-800 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
              >
                Recent activity
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-300" />
              </button>
              <button
                type="button"
                role="menuitem"
                aria-expanded={showExclusions}
                onClick={() => (setShowExclusions((v) => !v), setShowSettings(false))}
                className="flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-xs text-neutral-800 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
              >
                Exclusions
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-300" />
              </button>
            </div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close chat"
            onClick={onClose}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
          >
            <Close className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between px-0.5">
        <div>
          <div className="text-xs text-neutral-800">Background assistance</div>
          <div className="text-2xs text-neutral-400">{assistance.active ? 'Can restructure your workspace' : 'Off — browsing and restoration unaffected'}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={assistance.active}
          aria-label="Background assistance"
          onClick={() => void onSetAssistance(!assistance.active)}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${assistance.active ? 'bg-neutral-900' : 'bg-neutral-200'}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${assistance.active ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>

      {/* Scrolling middle: everything except the pinned header above and
          the pinned chat input below lives here, so the popover never
          grows past its max height and the input is always visible. */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className="flex shrink-0 flex-col gap-1.5">
        <div className={sectionLabel}>Recommended actions</div>
        {/* Overlapping deck: back cards peek out above the front card.
            Clicking any card fills the input; a peek also comes forward. */}
        <div className="relative h-[96px] shrink-0">
          {deck.map((key, i) => {
            const front = i === deck.length - 1
            const action = {
              find: {
                icon: <Search />,
                title: 'Find a tab',
                subtitle: `${context.tabs.length} tab${context.tabs.length === 1 ? '' : 's'} in context`,
                prompt: 'Find a tab about ',
              },
              resume: {
                icon: <Layers />,
                title: 'Resume work',
                subtitle: context.resumable.length > 0 ? `${context.resumable.length} saved workspace${context.resumable.length === 1 ? '' : 's'}` : 'No saved work yet',
                prompt: context.workspace ? `Resume my work in ${context.workspace.name}` : 'Resume my work',
              },
              organize: {
                icon: <Sparkles />,
                title: 'Organize',
                subtitle: context.workspace ? `Tidy tabs in ${context.workspace.name}` : 'Tidy your tabs',
                prompt: 'Organize my tabs',
              },
            }[key]
            return (
              <div
                key={key}
                className="absolute inset-x-0 transition-all duration-200"
                style={{ top: i * 24, zIndex: i, transform: `scale(${1 - (deck.length - 1 - i) * 0.03})`, opacity: front ? 1 : 0.85 }}
              >
                <ActionCard
                  icon={action.icon}
                  title={action.title}
                  subtitle={action.subtitle}
                  expanded={key === 'resume' && front ? showResume : undefined}
                  onClick={() => {
                    // Any card click fills the input with its prompt (and
                    // brings a peeking card to the front); Resume also
                    // opens the saved-workspaces list under the deck.
                    if (!front) setDeck((d) => [...d.filter((k) => k !== key), key])
                    setShowResume(key === 'resume' ? (front ? !showResume : true) : false)
                    fillPrompt(action.prompt)
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
      {showActivity && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-2xs font-medium text-neutral-400">Recent activity</span>
            <button
              type="button"
              disabled={!latestUndo}
              onClick={() => latestUndo?.checkpointId && onUndo(latestUndo.checkpointId)}
              className={ghostButton}
            >
              Undo
            </button>
          </div>
          {context.activity.length === 0 ? (
            <p className="px-0.5 py-1 text-2xs text-neutral-400">No recent activity yet.</p>
          ) : (
            context.activity.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-neutral-50">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-neutral-800">{a.title}</div>
                  <div className="truncate text-2xs text-neutral-400">{a.detail}</div>
                </div>
                {a.checkpointId && (
                  <button
                    type="button"
                    onClick={() => onUndo(a.checkpointId!)}
                    className={`${ghostButton} shrink-0`}
                  >
                    Undo
                  </button>
                )}
              </div>
            ))
          )}
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
                className="h-7 min-w-0 flex-1 rounded-[6px] bg-neutral-50 px-2.5 text-xs text-neutral-800 placeholder:text-neutral-400 outline-none focus:ring-1 focus:ring-neutral-400"
              />
              <button type="submit" className={ghostButton}>
                Add
              </button>
            </form>
            {assistance.excludedSites.map((site) => (
              <div key={site} className="mt-1 flex items-center justify-between px-0.5 py-0.5">
                <span className="truncate text-xs text-neutral-700">{site}</span>
                <button
                  type="button"
                  aria-label={`Remove ${site} exclusion`}
                  onClick={() => void onSetExclusions(assistance.excludedSites.filter((s) => s !== site), assistance.excludedWorkspaceIds)}
                  className="rounded-[6px] px-1.5 py-0.5 text-2xs text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
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
                <label key={w.id} className="mt-1 flex cursor-pointer items-center gap-2 px-0.5 py-0.5 text-xs text-neutral-700">
                  <input
                    type="checkbox"
                    checked={excluded}
                    onChange={() =>
                      void onSetExclusions(
                        assistance.excludedSites,
                        excluded ? assistance.excludedWorkspaceIds.filter((id) => id !== w.id) : [...assistance.excludedWorkspaceIds, w.id]
                      )
                    }
                    className="accent-neutral-900"
                  />
                  <span className="truncate">{w.name}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}


      {messages.length > 0 && (
        <div className="flex flex-col gap-4" aria-live="polite">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div
                key={i}
                className="max-w-[85%] self-end whitespace-pre-wrap rounded-lg bg-neutral-800 px-4 py-3 text-base leading-relaxed text-white shadow-sm [overflow-wrap:anywhere]"
              >
                {m.text}
              </div>
            ) : (
              <div key={i} className="flex gap-3 self-stretch">
                <MagicMark size={18} className="mt-0.5 shrink-0 text-neutral-900" />
                <div className="min-w-0 flex-1">
                  {m.tools && m.tools.length > 0 && (
                    <ul className="mb-2.5 flex flex-col gap-1.5">
                      {m.tools.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-sm leading-tight text-neutral-400">
                          <span
                            aria-hidden="true"
                            className={`shrink-0 ${t.status === 'running' ? 'animate-pulse text-neutral-400' : t.status === 'completed' ? 'text-emerald-600' : 'text-red-500'}`}
                          >
                            {t.status === 'running' ? '◌' : t.status === 'completed' ? '✓' : '✗'}
                          </span>
                          <span className="shrink-0">{t.name.replace(/_/g, ' ')}</span>
                          {summarizeInput(t.input) && <span className="truncate text-neutral-300">{summarizeInput(t.input)}</span>}
                          {t.error && <span className="truncate text-red-500">{t.error}</span>}
                          <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-neutral-300" />
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.text && <MarkdownText text={m.text} />}
                  {m.streaming && !m.text && (
                    <p className="animate-pulse text-sm text-neutral-400">{m.tools?.some((t) => t.status === 'running') ? 'Working…' : 'Magic is thinking…'}</p>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {matches.length > 0 && (
        <ul className="flex flex-col">
          {matches.map((t) => (
            <li key={`${t.workspaceId ?? ''}:${t.id}`}>
              <button
                type="button"
                onClick={() => onOpenTab(t)}
                className="flex w-full flex-col gap-0.5 rounded-[6px] px-2.5 py-1.5 text-left transition-colors hover:bg-neutral-50"
              >
                <span className="truncate text-xs text-neutral-800">{t.title || t.url}</span>
                <span className="flex min-w-0 items-center gap-2 text-2xs text-neutral-400">
                  <span className="shrink-0">{t.workspaceName}</span>
                  <span className="min-w-0 truncate">{t.url}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showResume && (
        <div className="flex flex-col gap-1 rounded-lg bg-neutral-50 p-1.5">
          {context.resumable.length === 0 ? (
            <p className="px-2 py-1.5 text-2xs text-neutral-400">No saved work to resume yet.</p>
          ) : (
            context.resumable.map((r) => (
              <button
                key={r.workspaceId}
                type="button"
                onClick={() => onResume(r.workspaceId)}
                className="flex w-full flex-col gap-0.5 rounded-[6px] bg-white px-2.5 py-1.5 text-left transition-colors hover:bg-neutral-100"
              >
                <span className="truncate text-xs text-neutral-800">{r.workspaceName}</span>
                <span className="flex min-w-0 items-center gap-2 text-2xs text-neutral-400">
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

      {notice && <p className="px-0.5 pb-0.5 text-2xs text-neutral-400">{notice}</p>}
      </div>

      <form onSubmit={submit} className="mt-1 shrink-0 pt-3.5">
        <div className="flex items-center gap-1.5 rounded-[6px] bg-neutral-50 p-1 transition-shadow focus-within:ring-1 focus-within:ring-neutral-400">
          <input
            aria-label="Ask Magic anything"
            ref={inputRef}
            autoFocus
            disabled={pending}
            value={query}
            onChange={(e) => (setQuery(e.currentTarget.value), setNotice(null))}
            placeholder="Ask a question or give a task…"
            className="min-w-0 flex-1 bg-transparent px-2.5 py-1 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none disabled:opacity-50"
          />
          <Button type="submit" variant="dark" disabled={pending || !query.trim()}>
            {pending ? 'Working…' : 'Ask'}
          </Button>
        </div>
      </form>
    </div>
  )
}
