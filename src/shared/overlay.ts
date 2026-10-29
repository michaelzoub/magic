import type { Bounds } from './engine'

export type TooltipSide = 'top' | 'right' | 'bottom'

export interface TooltipRequest {
  label: string
  shortcut?: string
  side: TooltipSide
  /** Anchor element rect, in window CSS pixels. */
  anchor: Bounds
}

/**
 * Floating shell UI that must paint above the native page view. Renderer DOM
 * can never overlap a WebContentsView, so these live in their own native layer.
 */
export interface ShellOverlay {
  showTooltip(req: TooltipRequest): void
  hideTooltip(): void
}

export const OVERLAY_IPC = {
  showTooltip: 'overlay:tooltip:show',
  hideTooltip: 'overlay:tooltip:hide'
} as const
