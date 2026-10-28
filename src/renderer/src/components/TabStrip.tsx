import type { TabState } from '@shared/engine'
import { motion } from '@/motion'
import { Close, Globe, Plus } from './icons'
import { IconButton } from './IconButton'

interface Props {
  tabs: TabState[]
  activeTabId: string | null
  onSelect(id: string): void
  onClose(id: string): void
  onNew(): void
}

export function TabStrip({ tabs, activeTabId, onSelect, onClose, onNew }: Props) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            ref={(el) => { if (el && !el.dataset.in) { el.dataset.in = '1'; motion.tabIn(el) } }}
            role="tab"
            aria-selected={active}
            onMouseDown={() => onSelect(tab.id)}
            onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
            className={`no-drag group relative flex h-7 min-w-0 max-w-[200px] flex-1 basis-0 items-center gap-2 rounded-md pl-2 pr-1 text-xs transition-colors duration-100
              ${active
                ? 'bg-chrome-active text-chrome-text shadow-[0_0_0_0.5px_rgb(var(--chrome-border)/0.1),0_1px_2px_rgb(0_0_0/0.06)]'
                : 'text-chrome-muted hover:bg-chrome-hover/[0.05] hover:text-chrome-text'} ${tab.isDiscarded ? 'opacity-60' : ''}`}
          >
            {tab.favicon ? (
              <img src={tab.favicon} alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm" />
            ) : (
              <Globe className={`h-3.5 w-3.5 shrink-0 text-chrome-faint ${tab.isLoading ? 'animate-pulse' : ''}`} />
            )}
            <span className="truncate">{tab.title}</span>
            <button
              type="button"
              aria-label="Close tab"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onClose(tab.id)}
              className={`ml-auto grid h-5 w-5 shrink-0 place-items-center rounded text-chrome-faint hover:bg-chrome-hover/[0.08] hover:text-chrome-text
                ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <Close className="h-3 w-3" />
            </button>
          </div>
        )
      })}
      <IconButton aria-label="New tab" title="New tab (⌘T)" onClick={(e) => (motion.press(e.currentTarget), onNew())} className="shrink-0">
        <Plus className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )
}
