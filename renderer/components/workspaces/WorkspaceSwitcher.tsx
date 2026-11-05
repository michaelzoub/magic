import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Plus, Trash } from '../ui/icons'
import { Button, MenuDivider, MenuItem, MenuLabel, Popover, Tooltip } from '../ui'
import { motion } from '@/motion'
import { feedbackBlueBg } from '../browser/feedbackStyle'
import { workspaceIcon, type UseWorkspaces } from '@/hooks/useWorkspaces'
import type { OverlayWorkspace } from '@shared/overlay'

type State = UseWorkspaces

/**
 * The one row geometry every side-panel entry uses, in both panel states.
 * Panel padding (10px) + row padding (8px) + this slot (16px, glyph centred)
 * puts every glyph centre at 26px — the centre of the 52px rail. Rows must
 * never add state-dependent padding/justification: `open` only controls
 * whether the label after the slot renders, so no icon ever moves.
 */
export const sidebarRow = `no-drag flex h-7 w-full items-center gap-1.5 overflow-hidden rounded-[6px] px-2 text-xs transition-colors duration-100 [&_svg]:size-3.5
  hover:bg-chrome-hover/[0.06] hover:text-chrome-text active:bg-chrome-hover/[0.10]`

const row = sidebarRow

/** Fixed-width glyph column shared by every side-panel row (see above). */
export function IconSlot({ children }: { children: ReactNode }) {
  return <span className="grid w-4 shrink-0 place-items-center">{children}</span>
}

/**
 * Trailing element count for a side-panel row: the plain number (no
 * leading zero) on a faint tinted background, so it reads as an amount
 * badge rather than part of the label — small (16px) and subtle
 * (`chrome-faint` on a 5% fill), never competing with the row label.
 * `min-w` keeps single digits a tidy box while wider counts grow with
 * padding.
 */
export function CountBadge({ count }: { count: number }) {
  return (
    <span className="ml-auto inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[4px] bg-chrome-hover/[0.05] px-1 text-3xs font-medium leading-none tabular-nums text-chrome-faint">
      {count}
    </span>
  )
}

/**
 * Menu body shared by the in-shell popover (plain-browser fallback) and the
 * native overlay renderer: workspace rows plus the inline create form.
 */
export function WorkspaceMenuContent({ workspaces, activeId, onSelect, onCreate, onDelete }: {
  workspaces: OverlayWorkspace[]
  activeId: string | null
  onSelect(id: string): void
  onCreate(name: string, goal: string): Promise<string | null>
  onDelete(id: string): void
}) {
  const [draft, setDraft] = useState<{ name: string; goal: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const err = await onCreate(draft?.name ?? '', draft?.goal ?? '')
    if (err) setError(err)
    // On success the caller closes the menu.
  }

  return (
    <div className="flex flex-col gap-1">
      <MenuLabel>Workspaces</MenuLabel>
      {workspaces.map((w) => {
        const Icon = workspaceIcon(w.icon)
        const item = (
          <div className="group/ws relative w-full">
            <MenuItem
              icon={<Icon />}
              label={w.name}
              detail={w.goal || undefined}
              selected={w.id === activeId}
              onSelect={() => onSelect(w.id)}
            />
            <button
              type="button"
              aria-label={`Delete workspace ${w.name}`}
              title={`Delete ${w.name}`}
              onClick={(e) => (e.stopPropagation(), onDelete(w.id))}
              className="absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-[6px] text-white/45 opacity-0 transition-opacity duration-75 hover:bg-white/[0.1] hover:text-red-300 focus-visible:opacity-100 group-hover/ws:opacity-100"
            >
              <Trash width={13} height={13} />
            </button>
          </div>
        )
        return w.goal ? (
          <Tooltip key={w.id} label={w.goal} wrap side="right" className="flex w-full">
            {item}
          </Tooltip>
        ) : (
          <div key={w.id}>{item}</div>
        )
      })}
      <MenuDivider />
      {draft === null ? (
        <MenuItem muted icon={<Plus />} label="Create workspace" onSelect={() => setDraft({ name: '', goal: '' })} />
      ) : (
        <div className="flex flex-col gap-2.5 px-2 py-2">
          <div className="px-0.5 text-2xs font-medium text-white/40">New workspace</div>
          <label className="flex flex-col gap-1">
            <span className="px-0.5 text-2xs text-white/45">Name</span>
            <input
              autoFocus
              value={draft.name}
              placeholder="e.g. Design Inspo"
              aria-label="Workspace name"
              aria-invalid={!!error}
              onInput={(e) => (setDraft({ ...draft, name: e.currentTarget.value }), setError(null))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') (e.stopPropagation(), setDraft(null), setError(null))
              }}
              className={`h-7 w-full rounded-[6px] bg-white/[0.06] px-2.5 text-white outline-none placeholder:text-white/35
                focus:ring-1 focus:ring-brand/70 ${error ? 'ring-1 ring-red-400/70' : ''}`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="px-0.5 text-2xs text-white/45">Goal <span className="text-white/30">(optional)</span></span>
            <textarea
              value={draft.goal}
              rows={3}
              placeholder="What do you want to get done in this workspace?"
              aria-label="Workspace goal"
              onInput={(e) => setDraft({ ...draft, goal: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), submit())
                if (e.key === 'Escape') (e.stopPropagation(), setDraft(null), setError(null))
              }}
              className="w-full resize-none rounded-[6px] bg-white/[0.06] px-2.5 py-2 leading-5 text-white outline-none placeholder:text-white/35
                focus:ring-1 focus:ring-brand/70"
            />
          </label>
          {error && <div className="px-0.5 text-2xs text-red-300">{error}</div>}
          <div className="flex items-center justify-end gap-1.5 pt-0.5">
            <Button variant="ghost" onClick={() => (setDraft(null), setError(null))}>Cancel</Button>
            <Button variant="primary" disabled={!draft.name.trim()} onClick={submit}>Create workspace</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The "+" button in the "Your workspaces" section header (a centred rail
 * row when the panel is collapsed): the one trigger for the workspaces
 * overview menu, which manages all workspaces rather than the workspace
 * being browsed. The `menuOpen` state is lifted to the Sidebar so the
 * trigger can carry its open state while the menu is up.
 */
export function WorkspaceMenu({ open: expanded, menuOpen: menu, onMenuOpenChange: setMenu, ws, onSelect, onCreate, onDelete }: {
  open: boolean
  menuOpen: boolean
  onMenuOpenChange(open: boolean): void
  ws: State
  onSelect(id: string): void
  onCreate(name: string, goal: string): Promise<string | null>
  onDelete(id: string): void
}) {
  const native = typeof window !== 'undefined' ? window.overlay : undefined

  const close = useCallback(() => {
    setMenu(false)
    native?.hideSurface()
  }, [native, setMenu])

  // The native overlay closes itself (backdrop/Escape/item pick); sync local state.
  useEffect(() => {
    if (!native) return
    const onClosed = (e: Event) => {
      if ((e as CustomEvent).detail === 'workspace-menu') setMenu(false)
    }
    window.addEventListener('magic:surface-closed', onClosed)
    return () => window.removeEventListener('magic:surface-closed', onClosed)
  }, [native, setMenu])

  const openMenu = (anchorEl: HTMLElement) => {
    setMenu(true)
    if (!native) return
    const r = anchorEl.getBoundingClientRect()
    native.showSurface({
      kind: 'workspace-menu',
      anchor: { x: r.x, y: r.y, width: r.width, height: r.height },
      placement: expanded ? 'bottom-start' : 'right-start',
      workspaces: ws.all.map((w) => ({ id: w.id, name: w.name, goal: w.goal, icon: w.icon })),
      activeId: ws.activeId
    })
  }

  const trigger = expanded ? (
    <button
      type="button"
      aria-label="New workspace"
      data-workspace-menu
      aria-haspopup="menu"
      aria-expanded={menu}
      onClick={(e) => (motion.press(e.currentTarget), menu ? close() : openMenu(e.currentTarget))}
      // No hover background of its own: in the expanded panel this sits
      // inside the "Your workspaces" header row, which already paints the
      // hover fill — a second translucent fill here would stack and show
      // as a darker patch around the + instead of blending into the row.
      className={`no-drag grid h-5 w-5 shrink-0 place-items-center rounded-[6px] text-chrome-text transition-colors ${menu ? 'bg-chrome-hover/[0.10]' : ''}`}
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  ) : (
    <button
      type="button"
      aria-label="New workspace"
      data-workspace-menu
      aria-haspopup="menu"
      aria-expanded={menu}
      onClick={(e) => (motion.press(e.currentTarget), menu ? close() : openMenu(e.currentTarget))}
      className={`${row} ${menu ? 'bg-chrome-hover/[0.10] font-medium text-chrome-text' : 'text-chrome-muted'}`}
    >
      <IconSlot><Plus className="h-3.5 w-3.5" /></IconSlot>
    </button>
  )

  return (
    <div className="relative">
      {expanded || menu ? trigger : <Tooltip label="New workspace" side="right">{trigger}</Tooltip>}
      {!native && (
        <Popover open={menu} onClose={close} label="Switch workspace" placement={expanded ? 'bottom-end' : 'right-start'} className={`!w-[320px] max-w-[calc(100vw-16px)] ${expanded ? '!left-0 !right-auto' : ''}`}>
          <WorkspaceMenuContent
            workspaces={ws.all.map((w) => ({ id: w.id, name: w.name, goal: w.goal, icon: w.icon }))}
            activeId={ws.activeId}
            onSelect={(id) => (onSelect(id), close())}
            onCreate={async (name, goal) => {
              const err = await onCreate(name, goal)
              if (!err) close()
              return err
            }}
            onDelete={onDelete}
          />
        </Popover>
      )}
    </div>
  )
}

/**
 * Sidebar section listing workspaces picked or created from the menu.
 * A row here is the workspace whose tabs are being browsed, so the active
 * row always carries the selected state as a background highlight (plus
 * `aria-current`) — including while the Workspaces overview menu is open,
 * where the same workspace is highlighted the same way.
 */
export type WorkspaceFeedback = { id: string; phase: 'preparing' | 'activated' } | null

export function WorkspaceList({ open: expanded, ws, feedback, onSelect }: { open: boolean; ws: State; feedback?: WorkspaceFeedback; onSelect(id: string): void }) {
  const listRef = useRef<HTMLDivElement>(null)

  // Brief glow on the row once its switch has actually completed.
  useEffect(() => {
    if (feedback?.phase !== 'activated') return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-workspace-id="${CSS.escape(feedback.id)}"]`)
    if (el) motion.workspaceGlow(el)
  }, [feedback])

  return (
    <div ref={listRef} className="contents">
      {ws.list.map((w) => {
        const active = w.id === ws.activeId
        const phase = feedback?.id === w.id ? feedback.phase : null
        const button = (
          <button
            type="button"
            aria-label={w.name}
            aria-current={active || undefined}
            aria-busy={phase === 'preparing' || undefined}
            data-workspace-id={w.id}
            data-workspace-feedback={phase ?? undefined}
            onClick={(e) => (motion.press(e.currentTarget), onSelect(w.id))}
            className={`${row} relative cursor-pointer ${active ? 'bg-chrome-hover/[0.10] font-medium text-chrome-text' : 'text-chrome-muted'}
              ${phase ? `${feedbackBlueBg} text-chrome-text` : ''}`}
          >
            <IconSlot><w.Icon /></IconSlot>
            {expanded && <span className="flex-1 overflow-hidden whitespace-nowrap text-clip text-left">{w.name}</span>}
            {phase === 'preparing' ? (
              <span aria-hidden="true" className="ml-auto h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-blue-300/30 border-t-blue-300" />
            ) : null}
            {/* Tab count hidden until the per-workspace tab invariant is implemented.
            {expanded && <CountBadge count={w.tabs?.length ?? 0} />} */}
          </button>
        )
        if (!expanded) {
          return (
            <Tooltip key={w.id} label={w.goal || w.name} wrap={!!w.goal} side="right">
              {button}
            </Tooltip>
          )
        }
        return w.goal ? (
          <Tooltip key={w.id} label={w.goal} wrap side="right" className="flex w-full">
            {button}
          </Tooltip>
        ) : (
          <div key={w.id}>{button}</div>
        )
      })}
    </div>
  )
}
