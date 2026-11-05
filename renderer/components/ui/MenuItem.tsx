import type { ReactNode } from 'react'

/** Row inside a dark menu surface. `selected` is a persistent background highlight (no trailing glyph). */
export function MenuItem({ icon, label, detail, selected, muted, onSelect }: {
  icon?: ReactNode
  label: string
  /** Secondary text (e.g. a workspace goal), shown on its own line(s) under the label; reveal it in full via a tooltip on the row. */
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
      className={`flex w-full gap-1.5 rounded-[6px] px-2 text-left outline-none transition-colors duration-75 [&_svg]:size-3.5
        focus-visible:bg-white/[0.08] ${muted ? 'text-white/55 hover:text-white/85' : 'text-white'}
        ${selected ? 'bg-white/[0.10] hover:bg-white/[0.13]' : 'hover:bg-white/[0.08]'}
        ${detail ? 'items-start py-1.5' : 'h-7 items-center'}`}
    >
      {icon && <span className={`grid w-3.5 shrink-0 place-items-center text-white/55 ${detail ? 'mt-px' : ''}`}>{icon}</span>}
      {detail ? (
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="overflow-hidden whitespace-nowrap text-clip leading-4">{label}</span>
          <span className="text-2xs leading-[1.35] text-white/40">{detail}</span>
        </span>
      ) : (
        <>
          <span className="overflow-hidden whitespace-nowrap text-clip">{label}</span>
          <span className="flex-1" />
        </>
      )}
    </button>
  )
}

export function MenuDivider() {
  return <div role="separator" className="h-1" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-1 text-2xs font-medium text-white/40">{children}</div>
}
