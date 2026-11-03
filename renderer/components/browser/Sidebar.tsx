import { useRef, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { ChevronUpDown, Memory, Plus, Settings, User } from '../ui/icons'
import { MagicMark, MagicWordmark } from '../ui/Brand'
import { Tooltip } from '../ui'
import { WorkspaceList, WorkspaceMenu } from '../workspaces/WorkspaceSwitcher'
import type { UseWorkspaces } from '@/hooks/useWorkspaces'
import { motion } from '@/motion'

export const RAIL = 52
const MIN = 160
const MAX = 320
const SNAP = 110 // releasing narrower than this collapses to the rail

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
      className={`no-drag flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-lg text-sm text-chrome-text/75
        transition-colors duration-100 hover:bg-chrome-hover/[0.05] hover:text-chrome-text active:bg-chrome-hover/[0.08]
        ${open ? 'px-2.5' : 'justify-center px-0'}`}
    >
      <span className="grid w-5 shrink-0 place-items-center">{children}</span>
      {open && <span className="truncate">{label}</span>}
      {open && count !== undefined && <span className="ml-auto text-xs tabular-nums text-chrome-faint">{pad(count)}</span>}
    </button>
  )
  // Labels are visible when expanded, so tooltips only help on the collapsed rail.
  return open ? button : <Tooltip label={label} side="right">{button}</Tooltip>
}

export function Sidebar({ width, onWidth, onMemory, memoryCount, onSettings, ws, onSelectWorkspace, onCreateWorkspace, onWorkspaceMenuOpenChange }: {
  width: number
  onWidth(w: number): void
  onMemory(): void
  memoryCount?: number
  onSettings(): void
  ws: UseWorkspaces
  /** Switching sets the target workspace's respective tabs as the open tabs (App enacts it). */
  onSelectWorkspace(id: string): void
  onCreateWorkspace(name: string, goal: string): Promise<string | null>
  onWorkspaceMenuOpenChange(open: boolean): void
}) {
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
      className={`relative flex shrink-0 flex-col border-r border-chrome-border/[0.09] bg-chrome-bg px-3 pb-3 pt-[44px] ${dragging ? '' : 'transition-[width] duration-200 ease-out'}`}
    >
      <div className="mb-3 flex h-10 items-center pl-2 text-chrome-text">
        {/* Asterisk is a fixed size/position in both states so toggling the
            sidebar never resizes or moves it; only the wordmark clips away. */}
        <span className="inline-flex items-center gap-[15px] overflow-hidden" role="img" aria-label="magic">
          <MagicMark size={15} className="shrink-0" />
          <span aria-hidden="true" className={`overflow-hidden transition-[max-width,opacity] duration-200 ${open ? 'max-w-[70px] opacity-100' : 'max-w-0 opacity-0'}`}>
            <MagicWordmark height={21} className="block shrink-0" />
          </span>
        </span>
      </div>

      <nav className="flex flex-col gap-1">
        <WorkspaceMenu open={open} ws={ws} onSelect={onSelectWorkspace} onCreate={onCreateWorkspace} onOpenChange={onWorkspaceMenuOpenChange} />
        {primary.map(({ label, Icon }) => (
          <RailButton key={label} label={label} open={open} count={label === 'Memory' ? memoryCount : undefined} onClick={label === 'Memory' ? onMemory : undefined}>
            <Icon />
          </RailButton>
        ))}
      </nav>

      {/* Context area: workspaces picked from the menu, pinned items, recent contexts. */}
      {ws.list.length > 0 && (
        <section className={`flex flex-col gap-1 ${open ? 'mt-5' : 'mt-3 border-t border-chrome-border/[0.09] pt-3'}`}>
          {open && (
            <div className="flex items-center justify-between px-2.5 pb-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-chrome-faint">Your workspaces</span>
              <button
                type="button"
                aria-label="New workspace"
                onClick={() => document.querySelector<HTMLButtonElement>('[data-workspace-menu]')?.click()}
                className="no-drag grid h-5 w-5 place-items-center rounded-md text-chrome-text transition-colors hover:bg-chrome-hover/[0.06]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <WorkspaceList open={open} ws={ws} onSelect={onSelectWorkspace} />
        </section>
      )}

      <div className="mt-auto">
        <RailButton label="Settings" open={open} onClick={onSettings}><Settings /></RailButton>
        <div className="mt-2 border-t border-chrome-border/[0.09] pt-2">
          <button
            type="button"
            aria-label="Account"
            onClick={(e) => (motion.press(e.currentTarget), onSettings())}
            className={`no-drag flex w-full items-center gap-2.5 overflow-hidden rounded-lg py-1.5 text-left transition-colors duration-100 hover:bg-chrome-hover/[0.05] ${open ? 'px-2' : 'justify-center px-0'}`}
          >
            <span className={`grid shrink-0 place-items-center rounded-full border border-chrome-border/20 text-chrome-muted ${open ? 'h-8 w-8' : 'h-7 w-7'}`}><User /></span>
            {open && (
              <>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[13px] font-medium text-chrome-text">Personal</span>
                  <span className="block truncate text-[11px] text-chrome-faint">Personal browser</span>
                </span>
                <ChevronUpDown className="shrink-0 text-chrome-faint" />
              </>
            )}
          </button>
        </div>
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
          ${dragging ? 'bg-brand/60' : 'group-hover:bg-chrome-border/[0.12]'}`} />
      </div>
    </aside>
  )
}
