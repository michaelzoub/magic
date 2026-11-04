import type { CSSProperties } from 'react'

/**
 * Shared treatment for operation feedback (workspace switch, tab
 * add/reuse/remove): a light blue wash with a faint blueprint grid and a
 * single hairline — no thick frames, no outer glow. The grid is two 1px
 * gradient lines tiled every 8px, drawn under the row's content.
 */
export const blueprintGrid: CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, rgb(59 130 246 / 0.09) 1px, transparent 1px), linear-gradient(to bottom, rgb(59 130 246 / 0.09) 1px, transparent 1px)',
  backgroundSize: '8px 8px'
}

/** The blueprint grid in red, for a tab marked for removal. */
export const blueprintGridRed: CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, rgb(239 68 68 / 0.10) 1px, transparent 1px), linear-gradient(to bottom, rgb(239 68 68 / 0.10) 1px, transparent 1px)',
  backgroundSize: '8px 8px'
}

/** Light blue wash + hairline for switched-to workspace rows. */
export const feedbackBlue = 'bg-blue-400/[0.10] shadow-[inset_0_0_0_1px_rgb(59_130_246/0.35)]'

/** Plain light blue background for an opened/reused tab — no border, no grid. */
export const feedbackBlueBg = 'bg-blue-300/30'

/** Same treatment in red for a tab being removed. */
export const feedbackRed = 'bg-red-400/[0.08] shadow-[inset_0_0_0_1px_rgb(239_68_68/0.35)]'
