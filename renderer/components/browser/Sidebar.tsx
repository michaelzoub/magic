import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import type { TargetedKeyboardEvent, TargetedPointerEvent } from 'preact'
import { ChevronRight, ChevronUpDown, Memory, Settings, SidebarIcon } from '../ui/icons'
import { MagicMark } from '../ui/Brand'
import { Popover, Tooltip } from '../ui'
import { MagicPopoverContent } from './MagicPopover'
import { CountBadge, IconSlot, WorkspaceList, WorkspaceMenu, sidebarRow } from '../workspaces/WorkspaceSwitcher'
import type { UseWorkspaces } from '@/hooks/useWorkspaces'
import { motion } from '@/motion'
import type { IdentitySpec } from '@core/identity'
import type { AgentRunResult, AgentStreamEvent, AssistanceSettings } from '@shared/agent'
import { DEFAULT_ASSISTANCE } from '@shared/agent'
import type { MagicActivity, MagicContext, MagicTab } from '@shared/overlay'
import { PixelTotem } from '@/features/identity'

/**
 * Side panel with two states: expanded (232px by default, drag-resizable
 * via the handle on its right edge, persisted) and the collapsed rail
 * (52px), toggled from the control at the top of the panel itself.
 * Toggling tweens between the two widths with GSAP (`motion.panelWidth`, 160ms): the aside's
 * width animates in per-frame pixel steps and the flex page area beside
 * it follows every frame (its ResizeObserver keeps the native page view
 * glued to the moving edge), instead of both jumping in a single frame.
 * Labels are the only clipped element, and they are sequenced, not
 * truncated: they unmount the instant a collapse starts, and on expand
 * they mount only once the panel is nearly full width (see below).
 *
 * Alignment: every entry (toggle, brand, nav rows, section header,
 * workspace rows, account) is built from the same `sidebarRow` + `IconSlot`
 * geometry exported by WorkspaceSwitcher — panel `px-2.5`, row `px-2`,
 * fixed `w-4` glyph slot — so each glyph's centre sits at 10 + 8 + 8 =
 * 26px, exactly the centre of the 52px rail, in BOTH states. Padding,
 * justification and icon size never change with state — the width tween
 * only narrows/widens the rows around their fixed left slot — so no icon
 * moves or resizes when the panel toggles.
 */
export const SIDEBAR_WIDTH = 232
export const RAIL = 52
/** Drag-resize bounds for the expanded panel: wide enough that labels
 *  never render truncated (above LABEL_REVEAL_WIDTH), narrow enough
 *  that the page area beside it stays usable. */
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 420
const SIDEBAR_WIDTH_KEY = 'magic:sidebar-width'

const clampSidebarWidth = (w: number) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(w)))

function storedSidebarWidth(): number {
  try {
    const raw = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY))
    return raw ? clampSidebarWidth(raw) : SIDEBAR_WIDTH
  } catch {
    return SIDEBAR_WIDTH
  }
}

type Item = { label: string; Icon: (p: SVGProps<SVGSVGElement>) => ReactNode }

const primary: Item[] = [
  { label: 'Memory', Icon: Memory },
]

function RailButton({ label, open, count, onClick, children }: { label: string; open: boolean; count?: number; onClick?(): void; children: ReactNode }) {
  const button = (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => (motion.press(e.currentTarget), onClick?.())}
      className={`${sidebarRow} text-chrome-text/75`}
    >
      <IconSlot>{children}</IconSlot>
      {open && <span className="truncate">{label}</span>}
      {open && count !== undefined && <CountBadge count={count} />}
    </button>
  )
  // Labels are visible when expanded, so tooltips only help on the rail.
  return open ? button : <Tooltip label={label} side="right">{button}</Tooltip>
}

/** Width (px) at which labels may appear during an expand — near enough
 *  to full width that no label renders truncated mid-tween. */
const LABEL_REVEAL_WIDTH = 192

export function Sidebar({ open, onToggle, onWidthChange, onMemory, memoryCount, onSettings, profile, ws, workspaceFeedback, onSelectWorkspace, onCreateWorkspace, onDeleteWorkspace, magicTabs, onOpenMagicTab, onAskRequest, assistance, magicActivity, onSetAssistance, onSetExclusions, onUndoMagic }: {
  open: boolean
  onToggle(): void
  /** Local user profile for the account row: display name + totem spec (null before onboarding completes). */
  profile?: { displayName: string; identity: IdentitySpec | null; identitySeed?: string | null } | null
  /** Animated panel width, reported every tween frame (and once on mount)
   *  so the shell can move width-dependent chrome (tab-strip inset) in
   *  sync instead of snapping it. Direct DOM writes only — no re-render. */
  onWidthChange?(width: number): void
  onMemory(): void
  memoryCount?: number
  onSettings(): void
  ws: UseWorkspaces
  /** In-flight / just-completed switch feedback for the target workspace row. */
  workspaceFeedback?: { id: string; phase: 'preparing' | 'activated' } | null
  /** Switching sets the target workspace's respective tabs as the open tabs (App enacts it). */
  onSelectWorkspace(id: string): void
  onCreateWorkspace(name: string, goal: string): Promise<string | null>
  onDeleteWorkspace(id: string): void
  /** Live open tabs of the active workspace, for the magic popover's tab search. */
  magicTabs?: { id: string; title: string; url: string }[]
  /** Open a tab found in the magic popover (switches workspace first when needed, then activates it). */
  onOpenMagicTab?(tab: MagicTab): void
  /** A chatbox question submitted from the magic popover; resolves with the agent's reply. */
  onAskRequest?(request: string, onEvent?: (event: AgentStreamEvent) => void): Promise<AgentRunResult>
  /** Global background-assistance state for the magic popover. */
  assistance?: AssistanceSettings
  /** Recent workspace activity for the magic popover, most recent first. */
  magicActivity?: MagicActivity[]
  onSetAssistance?(active: boolean): void
  onSetExclusions?(excludedSites: string[], excludedWorkspaceIds: string[]): void
  /** Undo a recorded reorganization by checkpoint id. */
  onUndoMagic?(checkpointId: string): void
}) {
  // Whether the Workspaces overview (menu, opened from the section
  // header below) is open, so the header trigger can carry its open state.
  const [workspaceOverviewOpen, setWorkspaceOverviewOpen] = useState(false)
  // Incremented when the profile row is opened: plays one finite pulse on
  // the totem (PixelTotem owns the tween; nothing renders continuously).
  const [profilePulse, setProfilePulse] = useState(0)
  // Compact popover anchored to the magic asterisk above the account row.
  // In Electron it renders in the native overlay layer (like the workspace
  // menu), so it floats above the page view without resizing it; the
  // Popover below is the plain-browser fallback.
  const [magicOpen, setMagicOpen] = useState(false)
  const nativeOverlay = typeof window !== 'undefined' ? window.overlay : undefined
  const closeMagic = useCallback(() => {
    setMagicOpen(false)
    nativeOverlay?.hideSurface()
  }, [nativeOverlay])
  // The native overlay closes itself (backdrop/Escape); sync local state.
  useEffect(() => {
    if (!nativeOverlay) return
    const onClosed = (e: Event) => {
      if ((e as CustomEvent).detail === 'magic-popover') setMagicOpen(false)
    }
    window.addEventListener('magic:surface-closed', onClosed)
    return () => window.removeEventListener('magic:surface-closed', onClosed)
  }, [nativeOverlay])
  /** Snapshot for the popover: current workspace, every findable tab (live
   *  tabs first, then other workspaces' saved tabs), and resumable work. */
  const magicContext = (): MagicContext => {
    const active = ws.all.find((w) => w.id === ws.activeId) ?? null
    const tabs: MagicTab[] = (magicTabs ?? []).map((t) => ({
      ...t,
      workspaceId: active?.id ?? null,
      workspaceName: active?.name ?? 'Current workspace'
    }))
    const resumable: MagicContext['resumable'] = []
    for (const w of ws.all) {
      if (w.id === ws.activeId) continue
      const saved = ws.getTabSet(w.id)
      tabs.push(...saved.tabs.map((t) => ({ id: t.id, title: t.title ?? '', url: t.url, workspaceId: w.id, workspaceName: w.name })))
      if (saved.tabs.length > 0) {
        resumable.push({
          workspaceId: w.id,
          workspaceName: w.name,
          tabCount: saved.tabs.length,
          activeTabTitle: saved.tabs.find((t) => t.id === saved.activeTabId)?.title ?? saved.tabs[saved.tabs.length - 1]?.title ?? ''
        })
      }
    }
    return {
      workspace: active ? { id: active.id, name: active.name, goal: active.goal } : null,
      tabs,
      resumable,
      assistance: assistance ?? DEFAULT_ASSISTANCE,
      workspaces: ws.all.map((w) => ({ id: w.id, name: w.name })),
      activity: magicActivity ?? [],
      identitySeed: profile?.identitySeed ?? null
    }
  }
  const openMagicTab = (tab: MagicTab) => {
    closeMagic()
    onOpenMagicTab?.(tab)
  }
  const toggleMagic = (anchorEl: HTMLElement) => {
    if (magicOpen) return closeMagic()
    setMagicOpen(true)
    if (!nativeOverlay) return
    const r = anchorEl.getBoundingClientRect()
    nativeOverlay.showSurface({
      kind: 'magic-popover',
      anchor: { x: r.x, y: r.y, width: r.width, height: r.height },
      context: magicContext()
    })
  }
  const asideRef = useRef<HTMLElement>(null)
  const widthChangeRef = useRef(onWidthChange)
  widthChangeRef.current = onWidthChange
  // Labels visible in the current frame. Distinct from `open` (the target
  // state): hidden for the whole collapse and for most of an expand, so
  // text is never seen truncated/sliding while the width is in between.
  const [labels, setLabels] = useState(open)
  const labelsRef = useRef(open)
  const setLabelsNow = (next: boolean) => {
    if (labelsRef.current === next) return
    labelsRef.current = next
    setLabels(next)
  }
  const firstRender = useRef(true)
  // User-chosen expanded width (drag handle on the right edge), persisted
  // across launches. The ref mirrors it for drag/tween callbacks, which
  // write the width straight to the DOM without re-rendering per frame.
  const [expandedWidth, setExpandedWidth] = useState(storedSidebarWidth)
  const expandedWidthRef = useRef(expandedWidth)
  const [resizing, setResizing] = useState(false)

  const applyWidth = useCallback((w: number) => {
    const el = asideRef.current
    if (el) el.style.width = `${w}px`
    widthChangeRef.current?.(w)
  }, [])

  /** Commit a new expanded width: state (for the separator's aria value),
   *  ref, and localStorage. The DOM width is already there (applyWidth). */
  const commitWidth = useCallback((w: number) => {
    const next = clampSidebarWidth(w)
    expandedWidthRef.current = next
    setExpandedWidth(next)
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next))
    } catch { /* private mode etc. — resizing still works this session */ }
  }, [])

  const onResizePointerDown = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (!open || e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startWidth = asideRef.current?.getBoundingClientRect().width ?? expandedWidthRef.current
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: PointerEvent) => applyWidth(clampSidebarWidth(startWidth + ev.clientX - startX))
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      commitWidth(startWidth + ev.clientX - startX)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const onResizeKeyDown = (e: TargetedKeyboardEvent<HTMLDivElement>) => {
    if (!open) return
    const step = e.shiftKey ? 24 : 8
    const next = e.key === 'ArrowRight' ? expandedWidthRef.current + step
      : e.key === 'ArrowLeft' ? expandedWidthRef.current - step
      : e.key === 'Home' ? SIDEBAR_WIDTH
      : null
    if (next === null) return
    e.preventDefault()
    applyWidth(clampSidebarWidth(next))
    commitWidth(next)
  }

  // Initial width, before first paint: no tween on mount.
  useLayoutEffect(() => {
    const el = asideRef.current
    if (!el) return
    const w = open ? expandedWidthRef.current : RAIL
    el.style.width = `${w}px`
    widthChangeRef.current?.(w)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = asideRef.current
    if (!el) return
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    // Collapse: labels leave before the first narrowing frame.
    if (!open) setLabelsNow(false)
    const tween = motion.panelWidth(
      el,
      open ? expandedWidthRef.current : RAIL,
      (w) => {
        widthChangeRef.current?.(w)
        // Expand: reveal labels only once they can render untruncated.
        if (open && w >= LABEL_REVEAL_WIDTH) setLabelsNow(true)
      },
      () => setLabelsNow(open)
    )
    return () => {
      tween?.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ])

  // Branded agent button for the bottom of the panel (see below). It uses
  // the same colours as the other sidebar rows (`text-chrome-text/75`,
  // chrome hover/active fills via `sidebarRow`); the trailing chevron is
  // what makes it read as a clickable button.
  // Icon and text both live in a 16px-tall centred line (IconSlot +
  // `leading-none` in an `h-4` flex span) so they align vertically.
  const magicButton = (
    <button
      type="button"
      aria-label="Magic — ask the agent"
      aria-haspopup="dialog"
      aria-expanded={magicOpen}
      onClick={(e) => (motion.press(e.currentTarget), toggleMagic(e.currentTarget))}
      className={`${sidebarRow} cursor-pointer text-chrome-text/75 ${
        magicOpen ? 'bg-chrome-hover/[0.10] text-chrome-text' : ''
      }`}
    >
      <IconSlot>
        <MagicMark size={14} className="shrink-0" />
      </IconSlot>
      {labels && (
        <>
          <span className="flex h-4 items-center text-xs font-medium leading-none">magic</span>
          <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-chrome-faint" />
        </>
      )}
    </button>
  )

  return (
    <aside
      ref={asideRef}
      className="relative flex shrink-0 flex-col overflow-hidden bg-chrome-bg px-2.5 pb-2"
    >
      {/* Window drag strip: reserved for the macOS traffic lights, which
          AppKit paints over this corner (standard window buttons — the
          same implementation Chrome uses, see main/index.ts). No visible
          element may live in it — the panel toggle starts below it. */}
      <div className="drag h-[44px] shrink-0" />

      {/* Panel toggle at the top of the panel. It is a plain sidebar row
          (same padding/slot as every other entry, no label in either
          state), so its glyph is on the shared 26px axis whether the
          panel is open or closed and toggling never moves it. Below the
          drag strip, so it never collides with the traffic lights. */}
      <Tooltip label={open ? 'Collapse sidebar' : 'Expand sidebar'} side="right">
        <button
          type="button"
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          // No motion.press here: scaling this full-width row around its
          // centre would drag the glyph off the 26px axis for the press
          // tween's whole run, on top of the width tween. The resize
          // itself (starting this same frame) is the feedback.
          onClick={onToggle}
          className={`${sidebarRow} shrink-0 text-chrome-text/75`}
        >
          <IconSlot><SidebarIcon /></IconSlot>
        </button>
      </Tooltip>

      <nav className="mt-1 flex flex-col gap-0.5">
        {primary.map(({ label, Icon }) => (
          <RailButton key={label} label={label} open={labels} count={label === 'Memory' ? memoryCount : undefined} onClick={label === 'Memory' ? onMemory : undefined}>
            <Icon />
          </RailButton>
        ))}
      </nav>

      {/* Context area: workspaces picked from the menu, pinned items, recent contexts. */}
      <section className="mt-3 flex flex-col gap-0.5">
        {/* Section header: label on the left, + on the right edge. The +
            is the one trigger for the workspaces overview menu (there is
            no separate "Workspaces" nav row). On the rail there is no
            right edge to speak of, so the + becomes a centred rail row
            instead. Both forms are h-7: a shorter open header would push
            every workspace row below it up/down by the difference when
            the panel toggles. The header renders even with no listed
            workspaces, so the + is always reachable. */}
        {labels ? (
          <div
            className="flex h-7 cursor-pointer items-center justify-between rounded-[6px] px-2 transition-colors duration-100 hover:bg-chrome-hover/[0.06]"
            // The whole header row opens the menu, not just the + button:
            // forward any click that didn't land on the trigger itself
            // (the trigger's own click toggles, so forwarding it too
            // would open and immediately close).
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('[data-workspace-menu]')) {
                e.currentTarget.querySelector<HTMLElement>('[data-workspace-menu]')?.click()
              }
            }}
          >
            <span className="text-2xs font-medium uppercase tracking-[0.08em] text-chrome-faint">Your workspaces</span>
            <WorkspaceMenu open={labels} menuOpen={workspaceOverviewOpen} onMenuOpenChange={setWorkspaceOverviewOpen} ws={ws} onSelect={onSelectWorkspace} onCreate={onCreateWorkspace} onDelete={onDeleteWorkspace} />
          </div>
        ) : (
          <WorkspaceMenu open={labels} menuOpen={workspaceOverviewOpen} onMenuOpenChange={setWorkspaceOverviewOpen} ws={ws} onSelect={onSelectWorkspace} onCreate={onCreateWorkspace} onDelete={onDeleteWorkspace} />
        )}
        <WorkspaceList open={labels} ws={ws} feedback={workspaceFeedback} onSelect={onSelectWorkspace} />
      </section>

      <div className="mt-auto">
        <div className="pt-2">
          {/* The brand is the agent entry point: a button-styled row
              above the account row, on the shared IconSlot axis so the
              asterisk stays centred on the rail. Expanded it carries a
              small "magic" label; collapsed only the asterisk remains.
              Clicking it toggles the compact magic popover (the agent)
              anchored to the row. */}
          <div className="relative mb-1.5">
            {labels ? magicButton : <Tooltip label="Magic — ask the agent" side="right" className="flex w-full">{magicButton}</Tooltip>}
            {!nativeOverlay && (
              <Popover
                open={magicOpen}
                onClose={closeMagic}
                placement="right-end"
                label="Magic"
                className="!z-[100] !rounded-lg !p-0 shadow-[0_24px_70px_rgb(0_0_0/0.35)]"
              >
                <MagicPopoverContent
                  onClose={closeMagic}
                  context={magicContext()}
                  onOpenTab={openMagicTab}
                  onResume={(workspaceId) => (closeMagic(), onSelectWorkspace(workspaceId))}
                  onAsk={(request, onEvent) =>
                    onAskRequest?.(request, onEvent) ?? Promise.resolve({ status: 'skipped' as const, reply: null, reason: 'Agent is not connected' })
                  }
                  onSetAssistance={(active) => onSetAssistance?.(active)}
                  onSetExclusions={(sites, workspaceIds) => onSetExclusions?.(sites, workspaceIds)}
                  onUndo={(checkpointId) => (closeMagic(), onUndoMagic?.(checkpointId))}
                />
              </Popover>
            )}
          </div>
          {/* Account: a standard sidebar row (fixed h-7 like every other
              entry), so its height is identical with labels shown or
              hidden — never taller in the expanded state. Single text
              line only; the old second "Personal browser" line was what
              stretched it. */}
          <button
            type="button"
            aria-label="Account"
            onClick={(e) => (motion.press(e.currentTarget), setProfilePulse((n) => n + 1), onSettings())}
            className={`${sidebarRow} text-left`}
          >
            <IconSlot>
              {profile?.identity ? (
                <PixelTotem spec={profile.identity} size={16} pulseKey={profilePulse} className="rounded-[4px]" />
              ) : (
                <Settings />
              )}
            </IconSlot>
            {labels && (
              <>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-chrome-text">
                  {profile?.displayName || 'Personal'}
                </span>
                <ChevronUpDown className="shrink-0 text-chrome-faint" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Drag-resize handle on the right edge (expanded only; the rail
          stays a fixed 52px). Writes the width straight to the aside on
          every move so the flex page area — and its native view —
          follows; the final width is committed/persisted on release.
          Double-click resets to the default; arrow keys resize when
          focused (Shift = larger steps, Home = default). */}
      {open && (
        <div
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={Math.round(expandedWidth)}
          tabIndex={0}
          onPointerDown={onResizePointerDown}
          onKeyDown={onResizeKeyDown}
          onDblClick={() => (applyWidth(SIDEBAR_WIDTH), commitWidth(SIDEBAR_WIDTH))}
          className={`no-drag absolute inset-y-0 right-0 z-20 w-1.5 touch-none outline-none transition-colors hover:bg-chrome-hover/[0.12] focus-visible:bg-chrome-hover/[0.12] ${resizing ? 'cursor-col-resize bg-chrome-hover/[0.12]' : 'cursor-col-resize'}`}
        />
      )}
    </aside>
  )
}
