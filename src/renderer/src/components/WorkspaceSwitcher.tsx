import { useCallback, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { Briefcase, ChevronUpDown, GradCap, Plus, User } from './icons'
import { MenuDivider, MenuItem, MenuLabel, Popover, Tooltip } from './ui'
import { motion } from '@/motion'

type Workspace = { id: string; name: string; Icon: (p: SVGProps<SVGSVGElement>) => ReactNode }

// Mock data; swap for a store once workspaces are real.
const workspaces: Workspace[] = [
  { id: 'personal', name: 'Personal', Icon: User },
  { id: 'work', name: 'Work', Icon: Briefcase },
  { id: 'school', name: 'School', Icon: GradCap },
]

export function WorkspaceSwitcher({ open: expanded }: { open: boolean }) {
  const [activeId, setActiveId] = useState('personal')
  const [menu, setMenu] = useState(false)
  const close = useCallback(() => setMenu(false), [])
  const active = workspaces.find((w) => w.id === activeId)!

  const trigger = (
    <button
      type="button"
      aria-label={`Workspace: ${active.name}`}
      aria-haspopup="menu"
      aria-expanded={menu}
      onClick={(e) => (motion.press(e.currentTarget), setMenu((m) => !m))}
      className={`no-drag flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-[7px] px-2 text-[13px] transition-colors duration-100
        hover:bg-chrome-hover/[0.06] hover:text-chrome-text active:bg-chrome-hover/[0.09]
        ${menu ? 'bg-chrome-hover/[0.06] text-chrome-text' : 'text-chrome-muted'}`}
    >
      <span className="grid w-4 shrink-0 place-items-center"><active.Icon /></span>
      {expanded && <>
        <span className="flex-1 truncate text-left">{active.name}</span>
        <ChevronUpDown className="shrink-0 text-chrome-faint" width={12} height={12} />
      </>}
    </button>
  )

  return (
    <div className="relative">
      {expanded || menu ? trigger : <Tooltip label={active.name} side="right">{trigger}</Tooltip>}
      <Popover open={menu} onClose={close} label="Switch workspace" placement={expanded ? 'bottom-start' : 'right-start'}>
        <MenuLabel>Workspaces</MenuLabel>
        {workspaces.map((w) => (
          <MenuItem
            key={w.id}
            icon={<w.Icon />}
            label={w.name}
            selected={w.id === activeId}
            onSelect={() => (setActiveId(w.id), close())}
          />
        ))}
        <MenuDivider />
        <MenuItem muted icon={<Plus />} label="Create workspace" onSelect={close} />
      </Popover>
    </div>
  )
}
