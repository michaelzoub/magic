import { useRef, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { Memory, Settings, SidebarIcon, Workspaces } from './icons'
import { Tooltip } from './ui'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { motion } from '@/motion'

export const RAIL = 52
const MIN = 160
const MAX = 320
const SNAP = 110 // releasing narrower than this collapses to the rail

type Item = { label: string; Icon: (p: SVGProps<SVGSVGElement>) => ReactNode }

const primary: Item[] = [
  { label: 'Workspace', Icon: Workspaces },
  { label: 'Memory', Icon: Memory },
]

function RailButton({ label, open, onClick, children }: { label: string; open: boolean; onClick?(): void; children: ReactNode }) {
  const button = (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => (motion.press(e.currentTarget), onClick?.())}
      className="no-drag flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-[7px] px-2 text-[13px] text-chrome-muted
        transition-colors duration-100 hover:bg-chrome-hover/[0.06] hover:text-chrome-text active:bg-chrome-hover/[0.09]"
    >
      <span className="grid w-4 shrink-0 place-items-center">{children}</span>
      {open && <span className="truncate">{label}</span>}
    </button>
  )
  // Labels are visible when expanded, so tooltips only help on the collapsed rail.
  return open ? button : <Tooltip label={label} side="right">{button}</Tooltip>
}

export function Sidebar({ width, onWidth, onToggle }: { width: number; onWidth(w: number): void; onToggle(): void }) {
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, w: 0 })
  const open = width > RAIL

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, w: width }
    setDragging(true)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return
    const w = start.current.w + e.clientX - start.current.x
    onWidth(w < SNAP ? RAIL : Math.min(MAX, Math.max(MIN, w)))
  }
  const onPointerUp = () => setDragging(false)

  return (
    <aside
      style={{ width }}
      className={`relative flex shrink-0 flex-col px-2.5 pb-3 pt-[44px] ${dragging ? '' : 'transition-[width] duration-200 ease-out'}`}
    >
      <div className="mb-2">
        <Tooltip label={open ? 'Hide sidebar' : 'Show sidebar'} side="right">
          <button
            type="button"
            aria-label={open ? 'Hide sidebar' : 'Show sidebar'}
            aria-expanded={open}
            onClick={(e) => (motion.press(e.currentTarget), onToggle())}
            className="no-drag grid h-8 w-8 place-items-center rounded-[7px] text-chrome-muted transition-colors duration-100
              hover:bg-chrome-hover/[0.06] hover:text-chrome-text active:bg-chrome-hover/[0.09]"
          >
            <SidebarIcon />
          </button>
        </Tooltip>
      </div>

      <nav className="flex flex-col gap-0.5">
        {primary.map(({ label, Icon }) => (
          <RailButton key={label} label={label} open={open}><Icon /></RailButton>
        ))}
      </nav>

      {/* Context area: workspace switcher, pinned items, recent contexts slot in here. */}
      <section className="mt-3 flex flex-col gap-0.5 border-t border-chrome-border/[0.08] pt-3">
        <WorkspaceSwitcher open={open} />
      </section>

      <div className="mt-auto">
        <RailButton label="Settings" open={open}><Settings /></RailButton>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDblClick={() => onWidth(open ? RAIL : 208)}
        className="no-drag group absolute -right-1 bottom-0 top-[44px] z-10 w-2 cursor-col-resize"
      >
        <div className={`mx-auto h-full w-px transition-colors duration-150
          ${dragging ? 'bg-[#5e6ad2]/60' : 'group-hover:bg-chrome-border/[0.12]'}`} />
      </div>
    </aside>
  )
}
