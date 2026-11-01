import { useCallback, useState } from 'react'
import { Plus, Workspaces } from './icons'
import { MenuDivider, MenuItem, MenuLabel, Popover, Tooltip } from './ui'
import { motion } from '@/motion'
import type { UseWorkspaces } from '@/engine/useWorkspaces'

type State = UseWorkspaces

const row = `no-drag flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-[7px] px-2 text-[13px] transition-colors duration-100
  hover:bg-chrome-hover/[0.06] hover:text-chrome-text active:bg-chrome-hover/[0.09]`

/** The "Workspace" nav button; opens the switcher popover. */
export function WorkspaceMenu({ open: expanded, ws, onSelect, onCreate, onOpenChange }: {
  open: boolean
  ws: State
  onSelect(id: string): void
  onCreate(name: string): Promise<string | null>
  /** Lets the shell detach the native page view while the dropdown is open. */
  onOpenChange?(open: boolean): void
}) {
  const [menu, setMenu] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
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
    const err = await onCreate(draft ?? '')
    err ? setError(err) : close()
  }

  const trigger = (
    <button
      type="button"
      aria-label="Workspace"
      aria-haspopup="menu"
      aria-expanded={menu}
      onClick={(e) => (motion.press(e.currentTarget), menu ? close() : setOpen(true))}
      className={`${row} ${menu ? 'bg-chrome-hover/[0.06] text-chrome-text' : 'text-chrome-muted'}`}
    >
      <span className="grid w-4 shrink-0 place-items-center"><Workspaces /></span>
      {expanded && <span className="truncate">Workspace</span>}
    </button>
  )

  return (
    <div className="relative">
      {expanded || menu ? trigger : <Tooltip label="Workspace" side="right">{trigger}</Tooltip>}
      <Popover open={menu} onClose={close} label="Switch workspace" placement={expanded ? 'bottom-start' : 'right-start'}>
        <MenuLabel>Workspaces</MenuLabel>
        {ws.all.map((w) => (
          <MenuItem
            key={w.id}
            icon={<w.Icon />}
            label={w.name}
            selected={w.id === ws.activeId}
            onSelect={() => (onSelect(w.id), close())}
          />
        ))}
        <MenuDivider />
        {draft === null ? (
          <MenuItem muted icon={<Plus />} label="Create workspace" onSelect={() => setDraft('')} />
        ) : (
          <div className="px-1 py-0.5">
            <input
              autoFocus
              value={draft}
              placeholder="Workspace name"
              aria-invalid={!!error}
              onInput={(e) => (setDraft(e.currentTarget.value), setError(null))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') (e.stopPropagation(), setDraft(null), setError(null))
              }}
              className={`h-7 w-full rounded-[5px] bg-white/[0.06] px-2 text-white outline-none placeholder:text-white/35
                ring-1 ${error ? 'ring-red-400/70' : 'ring-white/[0.08] focus:ring-[#5e6ad2]/70'}`}
            />
            {error && <div className="px-1 pt-1 text-[11px] text-red-300">{error}</div>}
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
            className={`${row} ${active ? 'bg-chrome-hover/[0.06] text-chrome-text' : 'text-chrome-muted'}`}
          >
            <span className="grid w-4 shrink-0 place-items-center"><w.Icon /></span>
            {expanded && <span className="flex-1 truncate text-left">{w.name}</span>}
          </button>
        )
        return expanded ? <div key={w.id}>{button}</div> : <Tooltip key={w.id} label={w.name} side="right">{button}</Tooltip>
      })}
    </>
  )
}
