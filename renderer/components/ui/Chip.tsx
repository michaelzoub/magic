import type { ReactNode } from 'react'

/**
 * The one small tag/chip look (extracted from the Memory dialog's status
 * chips): flat tinted fill, small 6px radius, no border/ring — never a
 * pill. Tone and size come from the variant/size props; `className` is
 * only for layout (e.g. `ml-auto`), not for re-styling the chip.
 */
export type ChipVariant = 'neutral' | 'fresh' | 'recent' | 'older' | 'light'
export type ChipSize = 'sm' | 'md'

const variantClasses: Record<ChipVariant, string> = {
  /** Default dark-surface tag (Memory's "old" recency tone). */
  neutral: 'bg-white/[0.08] text-white/50',
  fresh: 'bg-emerald-400/15 text-emerald-300',
  recent: 'bg-sky-400/15 text-sky-300',
  older: 'bg-amber-400/15 text-amber-300',
  /** Tag on light surfaces (e.g. the Magic popover). */
  light: 'bg-neutral-100 text-neutral-500'
}

const sizeClasses: Record<ChipSize, string> = {
  /** The original Memory-dialog size. */
  sm: 'px-1.5 py-0.5 text-2xs leading-4',
  md: 'px-2 py-0.5 text-xs leading-4'
}

export function Chip({ variant = 'neutral', size = 'sm', className = '', children }: {
  variant?: ChipVariant
  size?: ChipSize
  className?: string
  children: ReactNode
}) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-[6px] font-medium [&_svg]:size-3 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      {children}
    </span>
  )
}
