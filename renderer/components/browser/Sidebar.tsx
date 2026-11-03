import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { ChevronUpDown, Memory, Plus, Settings, SidebarIcon } from '../ui/icons'
import { MagicMark, MagicWordmark } from '../ui/Brand'
import { Tooltip } from '../ui'
import { IconSlot, WorkspaceList, WorkspaceMenu, sidebarRow } from '../workspaces/WorkspaceSwitcher'
import type { UseWorkspaces } from '@/hooks/useWorkspaces'
import { motion } from '@/motion'

/**
 * Side panel with exactly two fixed states: expanded (248px) and the
 * collapsed rail (52px), toggled from the control above the brand lockup
 * in the panel itself. It is not drag-resizable. Toggling tweens between
 * the two widths with GSAP (`motion.panelWidth`, 240ms): the aside's
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
export const SIDEBAR_WIDTH = 248
export const RAIL = 52

type Item = { label: string; Icon: (p: SVGProps<SVGSVGElement>) => ReactNode }

const primary: Item[] = [
  { label: 'Memory', Icon: Memory },
]

const pad = (n: number) => String(n).padStart(2, '0')

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
      {open && count !== undefined && <span className="ml-auto text-xs tabular-nums text-chrome-faint">{pad(count)}</span>}
    </button>
  )
  // Labels are visible when expanded, so tooltips only help on the rail.
  return open ? button : <Tooltip label={label} side="right">{button}</Tooltip>
}

/** Width (px) at which labels may appear during an expand — near enough
 *  to full width that no label renders truncated mid-tween. */
const LABEL_REVEAL_WIDTH = 205

export function Sidebar({ open, onToggle, onWidthChange, onMemory, memoryCount, onSettings, ws, onSelectWorkspace, onCreateWorkspace }: {
  open: boolean
  onToggle(): void
  /** Animated panel width, reported every tween frame (and once on mount)
   *  so the shell can move width-dependent chrome (tab-strip inset) in
   *  sync instead of snapping it. Direct DOM writes only — no re-render. */
  onWidthChange?(width: number): void
  onMemory(): void
  memoryCount?: number
  onSettings(): void
  ws: UseWorkspaces
  /** Switching sets the target workspace's respective tabs as the open tabs (App enacts it). */
  onSelectWorkspace(id: string): void
  onCreateWorkspace(name: string, goal: string): Promise<string | null>
}) {
  const openWorkspaceMenu = () => document.querySelector<HTMLButtonElement>('[data-workspace-menu]')?.click()
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

  // Initial width, before first paint: no tween on mount.
  useLayoutEffect(() => {
    const el = asideRef.current
    if (!el) return
    const w = open ? SIDEBAR_WIDTH : RAIL
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
      open ? SIDEBAR_WIDTH : RAIL,
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

  return (
    <aside
      ref={asideRef}
      className="relative flex shrink-0 flex-col overflow-hidden border-r border-chrome-border/[0.09] bg-chrome-bg px-2.5 pb-3"
    >
      {/* Window drag strip: reserved for the macOS traffic lights, which
          are painted by the OS over this corner. No visible element may
          live in it — the brand lockup starts below it. */}
      <div className="drag h-[44px] shrink-0" />

      {/* Panel toggle above the brand lockup. It is a plain sidebar row
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

      <div className="mb-3 flex h-10 items-center px-2 text-chrome-text">
        <span className="inline-flex items-center gap-2.5" role="img" aria-label="magic">
          <IconSlot>
            <MagicMark size={15} className="shrink-0" />
          </IconSlot>
          {labels && <MagicWordmark height={21} className="block shrink-0" />}
        </span>
      </div>

      <nav className="flex flex-col gap-1">
        <WorkspaceMenu open={labels} ws={ws} onSelect={onSelectWorkspace} onCreate={onCreateWorkspace} />
        {primary.map(({ label, Icon }) => (
          <RailButton key={label} label={label} open={labels} count={label === 'Memory' ? memoryCount : undefined} onClick={label === 'Memory' ? onMemory : undefined}>
            <Icon />
          </RailButton>
        ))}
      </nav>

      {/* Context area: workspaces picked from the menu, pinned items, recent contexts. */}
      {ws.list.length > 0 && (
        <section className="mt-3 flex flex-col gap-1 border-t border-chrome-border/[0.09] pt-3">
          {/* Section header: label on the left, + (New workspace) on the
              right edge. On the rail there is no right edge to speak of,
              so the + becomes a centred rail row instead. Both forms are
              h-9: a shorter open header would push every workspace row
              below it up/down by the difference when the panel toggles. */}
          {labels ? (
            <div className="flex h-9 items-center justify-between px-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-chrome-faint">Your workspaces</span>
              <button
                type="button"
                aria-label="New workspace"
                onClick={(e) => (motion.press(e.currentTarget), openWorkspaceMenu())}
                className="no-drag grid h-5 w-5 shrink-0 place-items-center rounded-md text-chrome-text transition-colors hover:bg-chrome-hover/[0.06]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <RailButton label="New workspace" open={labels} onClick={openWorkspaceMenu}>
              {/* Same 14px glyph as the open header's + — never resized. */}
              <Plus className="h-3.5 w-3.5" />
            </RailButton>
          )}
          <WorkspaceList open={labels} ws={ws} onSelect={onSelectWorkspace} />
        </section>
      )}

      <div className="mt-auto">
        <div className="border-t border-chrome-border/[0.09] pt-2">
          {/* Account: a standard sidebar row (fixed h-9 like every other
              entry), so its height is identical with labels shown or
              hidden — never taller in the expanded state. Single text
              line only; the old second "Personal browser" line was what
              stretched it. */}
          <button
            type="button"
            aria-label="Account"
            onClick={(e) => (motion.press(e.currentTarget), onSettings())}
            className={`${sidebarRow} text-left`}
          >
            <IconSlot>
              <Settings />
            </IconSlot>
            {labels && (
              <>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-chrome-text">Personal</span>
                <ChevronUpDown className="shrink-0 text-chrome-faint" />
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
