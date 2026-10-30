import { useCallback, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { Briefcase, GradCap, Layers, Plus, User, Workspaces } from './icons'
import { MenuDivider, MenuItem, MenuLabel, Popover, Tooltip } from './ui'
import { motion } from '@/motion'

type Workspace = { id: string; name: string; Icon: (p: SVGProps<SVGSVGElement>) => ReactNode }

// Mock data; swap for a store once workspaces are real.
const seed: Workspace[] = [
  { id: 'personal', name: 'Personal', Icon: User },
  { id: 'work', name: 'Work', Icon: Briefcase },
  { id: 'school', name: 'School', Icon: GradCap },
]

const key = (name: string) => name.trim().toLowerCase()

/**
 * Workspace state shared by the menu and the sidebar list.
 * Invariant: workspace names are unique (trimmed, case-insensitive).
 */
export function useWorkspaces() {
  const [all, setAll] = useState(seed)
  const [shown, setShown] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const select = useCallback((id: string) => {
    setShown((s) => (s.includes(id) ? s : [...s, id]))
    setActiveId(id)
  }, [])

  /** Returns an error message, or null on success. */
  const create = (raw: string): string | null => {
    const name = raw.trim()
    if (!name) return 'Name is required'
    if (all.some((w) => key(w.name) === key(name))) return `“${name}” already exists`
    const w: Workspace = { id: crypto.randomUUID(), name, Icon: Layers }
    setAll((a) => [...a, w])
    select(w.id)
    return null
  }

  const list = shown.map((id) => all.find((w) => w.id === id)!)
  return { all, list, activeId, select, create }
}

type State = ReturnType<typeof useWorkspaces>

const row = `no-drag flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-[7px] px-2 text-[13px] transition-colors duration-100
  hover:bg-chrome-hover/[0.06] hover:text-chrome-text active:bg-chrome-hover/[0.09]`

/** The "Workspace" nav button; opens the switcher popover. */
export function WorkspaceMenu({ open: expanded, ws }: { open: boolean; ws: State }) {
  const [menu, setMenu] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const close = useCallback(() => (setMenu(false), setDraft(null), setError(null)), [])

  const submit = () => {
    const err = ws.create(draft ?? '')
    err ? setError(err) : close()
  }

  const trigger = (
    <button
      type="button"
      aria-label="Workspace"
      aria-haspopup="menu"
      aria-expanded={menu}
      onClick={(e) => (motion.press(e.currentTarget), menu ? close() : setMenu(true))}
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
            onSelect={() => (ws.select(w.id), close())}
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
export function WorkspaceList({ open: expanded, ws }: { open: boolean; ws: State }) {
  return (
    <>
      {ws.list.map((w) => {
        const active = w.id === ws.activeId
        const button = (
          <button
            type="button"
            aria-label={w.name}
            aria-current={active}
            onClick={(e) => (motion.press(e.currentTarget), ws.select(w.id))}
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
