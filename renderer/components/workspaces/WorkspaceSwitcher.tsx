import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Plus, Trash, Workspaces } from '../ui/icons'
import { MenuDivider, MenuItem, MenuLabel, Popover, Tooltip } from '../ui'
import { motion } from '@/motion'
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
export const sidebarRow = `no-drag flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-lg px-2 text-sm transition-colors duration-100
  hover:bg-chrome-hover/[0.05] hover:text-chrome-text active:bg-chrome-hover/[0.08]`

const row = sidebarRow

/** Fixed-width glyph column shared by every side-panel row (see above). */
export function IconSlot({ children }: { children: ReactNode }) {
  return <span className="grid w-4 shrink-0 place-items-center">{children}</span>
}

/**
 * Trailing element count for a side-panel row: the plain number (no
 * leading zero) on a boxed background, so it reads as an amount badge
 * rather than part of the label. `min-w` keeps single digits a tidy
 * box while wider counts grow with padding; the inset ring keeps the
 * box visible on rows that already carry a hover/active background.
 */
export function CountBadge({ count }: { count: number }) {
  return (
    <span className="ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-md bg-chrome-hover/[0.07] px-1.5 text-[11px] font-medium leading-none tabular-nums text-chrome-muted ring-1 ring-inset ring-chrome-border/[0.09]">
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
    <>
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
              className={`absolute top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-[4px] text-white/45 opacity-0 transition-opacity duration-75 hover:bg-white/[0.1] hover:text-red-300 focus-visible:opacity-100 group-hover/ws:opacity-100 ${w.id === activeId ? 'right-6' : 'right-1'}`}
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
        <div className="flex flex-col gap-1 px-1 py-0.5">
          <input
            autoFocus
            value={draft.name}
            placeholder="Workspace name"
            aria-label="Workspace name"
            aria-invalid={!!error}
            onInput={(e) => (setDraft({ ...draft, name: e.currentTarget.value }), setError(null))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') (e.stopPropagation(), setDraft(null), setError(null))
            }}
            className={`h-7 w-full rounded-[5px] bg-white/[0.06] px-2 text-white outline-none placeholder:text-white/35
              ring-1 ${error ? 'ring-red-400/70' : 'ring-white/[0.08] focus:ring-brand/70'}`}
          />
          <textarea
            value={draft.goal}
            rows={2}
            placeholder="Goal: what do you want to get done? (optional)"
            aria-label="Workspace goal"
            onInput={(e) => setDraft({ ...draft, goal: e.currentTarget.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), submit())
              if (e.key === 'Escape') (e.stopPropagation(), setDraft(null), setError(null))
            }}
            className="min-h-11 w-full resize-none rounded-[5px] bg-white/[0.06] px-2 py-1.5 leading-5 text-white outline-none placeholder:text-white/35
              ring-1 ring-white/[0.08] focus:ring-brand/70"
          />
          {error && <div className="px-1 pt-0.5 text-[11px] text-red-300">{error}</div>}
        </div>
      )}
    </>
  )
}

/**
 * The "Workspaces" nav button: a destination for managing all workspaces,
 * not the workspace being browsed. It therefore takes the one strong
 * selected state only while its overview (menu) is open — the `menuOpen`
 * state is lifted to the Sidebar so the workspace list can demote the
 * active workspace to a subtler marker for the same duration (see
 * WorkspaceList). Closed, it is a plain nav row like Memory.
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

  const trigger = (
    <button
      type="button"
      aria-label="Workspaces"
      data-workspace-menu
      aria-haspopup="menu"
      aria-expanded={menu}
      onClick={(e) => (motion.press(e.currentTarget), menu ? close() : openMenu(e.currentTarget))}
      className={`${row} ${menu ? 'bg-chrome-hover/[0.055] font-medium text-chrome-text' : 'text-chrome-muted'}`}
    >
      <IconSlot><Workspaces /></IconSlot>
      {expanded && <span className="truncate">Workspaces</span>}
      {expanded && <CountBadge count={ws.all.length} />}
    </button>
  )

  return (
    <div className="relative">
      {expanded || menu ? trigger : <Tooltip label="Workspace" side="right">{trigger}</Tooltip>}
      {!native && (
        <Popover open={menu} onClose={close} label="Switch workspace" placement={expanded ? 'bottom-start' : 'right-start'}>
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
 * A row here is the workspace whose tabs are being browsed, so normally
 * the active row carries the one strong selected state. While the
 * Workspaces overview is open (`overviewOpen`) that strong state belongs
 * to the "Workspaces" destination instead, and the active workspace is
 * demoted to a subtler marker — a small dot (plus `aria-current`) — so
 * the two are never mistaken for the same kind of selection.
 */
export function WorkspaceList({ open: expanded, overviewOpen = false, ws, onSelect }: { open: boolean; overviewOpen?: boolean; ws: State; onSelect(id: string): void }) {
  return (
    <>
      {ws.list.map((w) => {
        const active = w.id === ws.activeId
        const demoted = active && overviewOpen
        const button = (
          <button
            type="button"
            aria-label={w.name}
            aria-current={active || undefined}
            onClick={(e) => (motion.press(e.currentTarget), onSelect(w.id))}
            className={`${row} relative ${active && !demoted ? 'bg-chrome-hover/[0.055] font-medium text-chrome-text' : 'text-chrome-muted'}`}
          >
            <IconSlot><w.Icon /></IconSlot>
            {expanded && <span className="flex-1 truncate text-left">{w.name}</span>}
            {demoted && (
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full bg-chrome-text/50 ${expanded ? '' : 'absolute right-1 top-1'}`}
              />
            )}
            {expanded && <CountBadge count={w.tabs?.length ?? 0} />}
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
    </>
  )
}
