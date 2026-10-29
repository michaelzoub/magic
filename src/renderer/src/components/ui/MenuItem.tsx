import type { ReactNode } from 'react'
import { Check } from '../icons'

/** Row inside a dark menu surface. `selected` shows a trailing checkmark. */
export function MenuItem({ icon, label, selected, muted, onSelect }: {
  icon?: ReactNode
  label: string
  selected?: boolean
  muted?: boolean
  onSelect(): void
}) {
  return (
    <button
      type="button"
      role={selected === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={selected}
      onClick={onSelect}
      className={`flex h-7 w-full items-center gap-2 rounded-[5px] px-2 text-left outline-none transition-colors duration-75
        hover:bg-white/[0.08] focus-visible:bg-white/[0.08] ${muted ? 'text-white/55 hover:text-white/85' : 'text-white'}`}
    >
      {icon && <span className="grid w-4 shrink-0 place-items-center text-white/55">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {selected && <Check className="shrink-0 text-white/85" width={14} height={14} />}
    </button>
  )
}

export function MenuDivider() {
  return <div role="separator" className="mx-1 my-1 h-px bg-white/[0.08]" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-white/40">{children}</div>
}
