import type { Bounds } from './engine'
import type { Checkpoint, CheckpointId } from '@core/memory/types'
import type { AgentStreamEvent, AgentSwitchNoticeState, AgentTabProposal, AssistanceSettings } from './agent'
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

/** Small bottom-center dock notice shown when the model's drift judgment fires. */
export interface WorkspaceDriftNoticeState {
  workspaceName: string
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
  | { kind: 'memory'; checkpoints: Checkpoint[]; workspaces: OverlayWorkspace[] }
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
  | { kind: 'magic-popover'; anchor: Bounds; context: MagicContext }

/** A tab the magic popover can find and open, in the current or a saved workspace. */
export interface MagicTab {
  id: string
  title: string
  url: string
  workspaceId: string | null
  workspaceName: string
}

/** A workspace with saved tabs the user can pick back up from the magic popover. */
export interface MagicResumable {
  workspaceId: string
  workspaceName: string
  tabCount: number
  /** Title of the tab that was active when the workspace was left, when known. */
  activeTabTitle: string
}

/** One recent-activity row in the magic popover; `checkpointId` is set when it can be undone. */
export interface MagicActivity {
  id: string
  title: string
  detail: string
  checkpointId: string | null
}

/** Serializable snapshot the shell hands the magic popover when it opens. */
export interface MagicContext {
  workspace: { id: string; name: string; goal: string } | null
  tabs: MagicTab[]
  resumable: MagicResumable[]
  /** Global background-assistance state (see @shared/agent). */
  assistance: AssistanceSettings
  /** All workspaces, for the workspace exclusions list. */
  workspaces: { id: string; name: string }[]
  /** Recent workspace activity, most recent first. */
  activity: MagicActivity[]
  /** User's totem seed, so the chat thinking state can animate their identity like the bottom dock does. */
  identitySeed?: string | null
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
  /** Open a tab found from the magic popover, switching workspace first when it lives in another one. */
  | { type: 'magic:open-tab'; workspaceId: string | null; tabId: string }
  /** The user asked, from the magic popover, for help organizing the current workspace. */
  | { type: 'magic:organize'; request: string }
  /** A chatbox question for the agent; resolves with the AgentRunResult (reply included).
   *  Live stream events for it are pushed separately under `streamId`. */
  | { type: 'magic:ask'; request: string; streamId: string }
  /** Toggle global background assistance from the magic popover; resolves with the stored state. */
  | { type: 'magic:set-assistance'; active: boolean }
  /** Replace site/workspace exclusions from the magic popover; resolves with the stored state. */
  | { type: 'magic:set-exclusions'; excludedSites: string[]; excludedWorkspaceIds: string[] }
  /** Undo a recorded reorganization by restoring its checkpoint's Before tabs. */
  | { type: 'magic:undo'; checkpointId: string }
  /** Apply the staged tab proposals shown in the agent switch notice. */
  | { type: 'agent:apply-proposals'; proposals: AgentTabProposal[] }
  /** Dismiss the agent switch notice (discarding any proposals). */
  | { type: 'agent:dismiss-notice' }
  /** Dismiss the workspace drift notice. */
  | { type: 'drift:dismiss-notice' }
  /** Quit the active workspace from the drift notice (tabs stay open, outside any workspace). */
  | { type: 'drift:quit-workspace' }

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
  /** Forward one live agent stream event to the overlay renderer (magic:ask streaming). */
  pushMagicAgentEvent(streamId: string, event: AgentStreamEvent): void
  /** Show/update (or clear, with null) the bottom-center agent switch notice above the page. */
  showAgentNotice(notice: AgentSwitchNoticeState | null): void
  /** Show (or clear, with null) the small bottom-center drift notice above the page. */
  showDriftNotice(notice: WorkspaceDriftNoticeState | null): void
}

/** API exposed only to the overlay renderer. */
export interface OverlayHost {
  /** Receive surface requests pushed by the shell. Returns an unsubscribe. */
  onSurface(handler: (req: SurfaceRequest | null) => void): () => void
  /** Ask the shell to perform an action; resolves with its result (e.g. a create error). */
  requestAction(action: OverlayAction): Promise<unknown>
  /** Receive live agent stream events pushed by the shell. Returns an unsubscribe. */
  onAgentEvent(handler: (streamId: string, event: AgentStreamEvent) => void): () => void
  /** Receive agent switch notice updates pushed by the shell (null = hidden). Returns an unsubscribe. */
  onAgentNotice(handler: (notice: AgentSwitchNoticeState | null) => void): () => void
  /** Receive workspace drift notice updates pushed by the shell (null = hidden). Returns an unsubscribe. */
  onDriftNotice(handler: (notice: WorkspaceDriftNoticeState | null) => void): () => void
  /** Report the agent notice panel's rendered height so the native layer can hug it. */
  reportNoticeHeight(px: number): void
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
  dismiss: 'overlay:dismiss',
  /** shell -> main -> overlay renderer: one live agent stream event (magic:ask). */
  agentEvent: 'overlay:agent-event',
  /** shell -> main -> overlay renderer: current agent switch notice (null = none). */
  agentNotice: 'overlay:agent-notice',
  /** shell -> main -> overlay renderer: current workspace drift notice (null = none). */
  driftNotice: 'overlay:drift-notice',
  /** overlay renderer -> main: rendered height (px) of the agent notice panel, so the native layer hugs it. */
  noticeHeight: 'overlay:notice-height'
} as const

/**
 * Width of the workspace dropdown. Deliberately wider than the sidebar /
 * collapsed rail it anchors to: rows show each workspace's goal under its
 * name, and the inline create form needs room for its goal field — at the
 * old 180–232px the goal was truncated to a few characters.
 */
export const WORKSPACE_MENU_WIDTH = 320

/** Top-left of a workspace dropdown panel for `anchor`, clamped into the window. */
export function menuPosition(
  req: Extract<SurfaceRequest, { kind: 'workspace-menu' }>,
  size: { width: number; height: number },
  window: { width: number; height: number }
): { x: number; y: number; width: number } {
  const width = Math.min(WORKSPACE_MENU_WIDTH, Math.max(180, window.width - 8))
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

export const MAGIC_POPOVER_WIDTH = 440

/** Fixed chat height: typing, tab matches, and streaming must never resize the popover. */
export const MAGIC_POPOVER_HEIGHT = 520

/**
 * Top-left of the compact magic popover for `anchor`: directly above the button,
 * bottom-aligned with it (the icon sits near the window's bottom edge),
 * clamped into the window.
 */
export function magicPopoverPosition(
  anchor: Bounds,
  size: { height: number },
  window: { width: number; height: number }
): { x: number; y: number; width: number } {
  // Directly above the button, left edges aligned.
  const raw = { x: anchor.x, y: anchor.y - size.height - 8 }
  return {
    x: Math.max(4, Math.min(Math.round(raw.x), Math.max(4, window.width - MAGIC_POPOVER_WIDTH - 4))),
    y: Math.max(4, Math.min(Math.round(raw.y), Math.max(4, window.height - size.height - 4))),
    width: MAGIC_POPOVER_WIDTH
  }
}
