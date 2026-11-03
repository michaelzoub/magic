import type { Bounds } from './engine'
import type { Checkpoint, CheckpointId } from '@core/memory/types'
import type { CompletedOnboarding } from './onboarding'

export type TooltipSide = 'top' | 'right' | 'bottom'

export interface TooltipRequest {
  label: string
  /** Wrap the label over multiple lines instead of keeping it on one nowrap line. */
  wrap?: boolean
  shortcut?: string
  side: TooltipSide
  /** Anchor element rect, in window CSS pixels. */
  anchor: Bounds
}

/** Serializable workspace row shown in the native workspace dropdown. */
export interface OverlayWorkspace {
  id: string
  name: string
  goal: string
  icon: string
}

/**
 * A floating surface the shell wants shown above the native page view.
 * Rendered by the overlay renderer (see renderer/overlay) inside a native
 * WebContentsView — never by painting over / detaching the page view.
 */
export type SurfaceRequest =
  | { kind: 'memory'; checkpoints: Checkpoint[] }
  | { kind: 'import' }
  | { kind: 'onboarding' }
  | { kind: 'profile'; completed: CompletedOnboarding | null }
  | {
      kind: 'workspace-menu'
      anchor: Bounds
      placement: 'bottom-start' | 'right-start'
      workspaces: OverlayWorkspace[]
      activeId: string | null
    }

export type SurfaceKind = SurfaceRequest['kind']

/** Actions the overlay renderer asks the shell renderer to perform. */
export type OverlayAction =
  | { type: 'surface:close'; kind: SurfaceKind }
  | { type: 'memory:navigate'; checkpointId: CheckpointId; target: 'before' | 'after' }
  | { type: 'import:imported' }
  | { type: 'profile:updated'; completed: CompletedOnboarding }
  | { type: 'workspace:select'; id: string }
  | { type: 'workspace:create'; name: string; goal: string }
  | { type: 'workspace:delete'; id: string }

/**
 * Floating shell UI that must paint above the native page view. Renderer DOM
 * in the shell window can never overlap a WebContentsView, so these live in
 * their own native layer (a transparent WebContentsView stacked above the
 * page views by the main process).
 */
export interface ShellOverlay {
  showTooltip(req: TooltipRequest): void
  hideTooltip(): void
  /** Show (or update) a dialog/dropdown in the native overlay layer. */
  showSurface(req: SurfaceRequest): void
  hideSurface(): void
  /** Register the shell-side handler for overlay actions. Returns an unsubscribe. */
  onAction(handler: (action: OverlayAction) => Promise<unknown>): () => void
}

/** API exposed only to the overlay renderer. */
export interface OverlayHost {
  /** Receive surface requests pushed by the shell. Returns an unsubscribe. */
  onSurface(handler: (req: SurfaceRequest | null) => void): () => void
  /** Ask the shell to perform an action; resolves with its result (e.g. a create error). */
  requestAction(action: OverlayAction): Promise<unknown>
  /** Hide this overlay immediately (the shell is also told via surface:close). */
  dismiss(kind: SurfaceKind): void
}

export const OVERLAY_IPC = {
  showTooltip: 'overlay:tooltip:show',
  hideTooltip: 'overlay:tooltip:hide',
  showSurface: 'overlay:surface:show',
  hideSurface: 'overlay:surface:hide',
  /** main -> overlay renderer: current surface (null = none). */
  surface: 'overlay:surface',
  /** overlay -> main (invoke): perform an action in the shell. */
  action: 'overlay:action',
  /** main -> shell renderer: an action request awaiting a response. */
  actionRequest: 'overlay:action:request',
  actionResponse: 'overlay:action:response',
  /** overlay -> main: hide the overlay view now. */
  dismiss: 'overlay:dismiss'
} as const

/** Top-left of a workspace dropdown panel for `anchor`, clamped into the window. */
export function menuPosition(
  req: Extract<SurfaceRequest, { kind: 'workspace-menu' }>,
  size: { width: number; height: number },
  window: { width: number; height: number }
): { x: number; y: number; width: number } {
  const width = req.placement === 'right-start' ? 200 : Math.max(180, req.anchor.width)
  const raw =
    req.placement === 'right-start'
      ? { x: req.anchor.x + req.anchor.width + 8, y: req.anchor.y }
      : { x: req.anchor.x, y: req.anchor.y + req.anchor.height + 4 }
  return {
    x: Math.max(4, Math.min(Math.round(raw.x), Math.max(4, window.width - width - 4))),
    y: Math.max(4, Math.min(Math.round(raw.y), Math.max(4, window.height - size.height - 4))),
    width
  }
}
