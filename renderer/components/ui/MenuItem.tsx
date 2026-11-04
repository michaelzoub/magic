import type { ReactNode } from 'react'
import { Check } from './icons'

/** Row inside a dark menu surface. `selected` shows a trailing checkmark. */
export function MenuItem({ icon, label, detail, selected, muted, onSelect }: {
  icon?: ReactNode
  label: string
  /** Secondary text (e.g. a workspace goal), truncated after the label; reveal it in full via a tooltip on the row. */
  detail?: string
  selected?: boolean
  muted?: boolean
  onSelect(): void
}) {
  return (
    <button
      type="button"
      data-animate-item
      role={selected === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={selected}
      onClick={onSelect}
      className={`flex h-7 w-full items-center gap-1.5 rounded-[6px] px-2 text-left outline-none transition-colors duration-75 [&_svg]:size-3.5
        hover:bg-white/[0.08] focus-visible:bg-white/[0.08] ${muted ? 'text-white/55 hover:text-white/85' : 'text-white'}`}
    >
      {icon && <span className="grid w-3.5 shrink-0 place-items-center text-white/55">{icon}</span>}
      <span className="truncate">{label}</span>
      {detail && <span className="min-w-0 flex-1 truncate text-2xs text-white/40">{detail}</span>}
      {!detail && <span className="flex-1" />}
      {selected && <Check className="shrink-0 text-white/85" width={12} height={12} />}
    </button>
  )
}

export function MenuDivider() {
  return <div role="separator" className="my-1 h-1" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-1 text-2xs font-medium text-white/40">{children}</div>
}
