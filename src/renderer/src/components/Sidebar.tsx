import { Workspaces } from './icons'
import { motion } from '@/motion'

export function Sidebar() {
  return (
    <aside className="flex w-[52px] shrink-0 flex-col items-center pt-[52px]">
      <button
        type="button"
        title="Workspaces"
        aria-label="Workspaces"
        onClick={(e) => motion.press(e.currentTarget)}
        className="no-drag grid h-8 w-8 place-items-center rounded-lg text-chrome-muted transition-colors
          hover:bg-chrome-hover/[0.06] hover:text-chrome-text"
      >
        <Workspaces />
      </button>
    </aside>
  )
}
