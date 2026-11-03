import { useCallback, useState } from 'react'
import { Plus, Workspaces } from '../ui/icons'
import { MenuDivider, MenuItem, MenuLabel, Popover, Tooltip } from '../ui'
import { motion } from '@/motion'
import type { UseWorkspaces } from '@/hooks/useWorkspaces'

type State = UseWorkspaces

const row = `no-drag flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-lg text-sm transition-colors duration-100
  hover:bg-chrome-hover/[0.05] hover:text-chrome-text active:bg-chrome-hover/[0.08]`

/** Expanded rows are left-aligned with padding; on the collapsed rail the icon is centred with no padding (else it overflows the 28px inner width and clips). */
const rowAlign = (expanded: boolean) => (expanded ? 'px-2.5' : 'justify-center px-0')

const pad = (n: number) => String(n).padStart(2, '0')

/** The "Workspace" nav button; opens the switcher popover. */
export function WorkspaceMenu({ open: expanded, ws, onSelect, onCreate, onOpenChange }: {
  open: boolean
  ws: State
  onSelect(id: string): void
  onCreate(name: string, goal: string): Promise<string | null>
  /** Lets the shell detach the native page view while the dropdown is open. */
  onOpenChange?(open: boolean): void
}) {
  const [menu, setMenu] = useState(false)
  const [draft, setDraft] = useState<{ name: string; goal: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const setOpen = useCallback(
    (next: boolean) => {
      setMenu(next)
      onOpenChange?.(next)
    },
    [onOpenChange]
  )
  const close = useCallback(() => (setOpen(false), setDraft(null), setError(null)), [setOpen])

  const submit = async () => {
    const err = await onCreate(draft?.name ?? '', draft?.goal ?? '')
    err ? setError(err) : close()
  }

  const trigger = (
    <button
      type="button"
      aria-label="Workspaces"
      data-workspace-menu
      aria-haspopup="menu"
      aria-expanded={menu}
      onClick={(e) => (motion.press(e.currentTarget), menu ? close() : setOpen(true))}
      className={`${row} ${rowAlign(expanded)} ${menu || expanded ? 'bg-chrome-hover/[0.055] font-medium text-chrome-text' : 'text-chrome-muted'}`}
    >
      <span className="grid w-5 shrink-0 place-items-center"><Workspaces /></span>
      {expanded && <span className="truncate">Workspaces</span>}
      {expanded && <span className="ml-auto text-xs tabular-nums text-chrome-faint">{pad(ws.all.length)}</span>}
    </button>
  )

  return (
    <div className="relative">
      {expanded || menu ? trigger : <Tooltip label="Workspace" side="right">{trigger}</Tooltip>}
      <Popover open={menu} onClose={close} label="Switch workspace" placement={expanded ? 'bottom-start' : 'right-start'}>
        <MenuLabel>Workspaces</MenuLabel>
        {ws.all.map((w) => {
          const item = (
            <MenuItem
              icon={<w.Icon />}
              label={w.name}
              detail={w.goal || undefined}
              selected={w.id === ws.activeId}
              onSelect={() => (onSelect(w.id), close())}
            />
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
      </Popover>
    </div>
  )
}

/** Sidebar section listing workspaces picked or created from the menu. */
export function WorkspaceList({ open: expanded, ws, onSelect }: { open: boolean; ws: State; onSelect(id: string): void }) {
  return (
    <>
      {ws.list.map((w) => {
        const active = w.id === ws.activeId
        const button = (
          <button
            type="button"
            aria-label={w.name}
            aria-current={active}
            onClick={(e) => (motion.press(e.currentTarget), onSelect(w.id))}
            className={`${row} ${rowAlign(expanded)} ${active ? 'bg-chrome-hover/[0.055] font-medium text-chrome-text' : 'text-chrome-muted'}`}
          >
            <span className="grid w-5 shrink-0 place-items-center"><w.Icon /></span>
            {expanded && <span className="flex-1 truncate text-left">{w.name}</span>}
            {expanded && <span className="text-xs tabular-nums text-chrome-faint">{pad(w.tabs?.length ?? 0)}</span>}
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
