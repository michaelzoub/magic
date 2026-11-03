/**
 * Embedded-agent contract between renderer, preload, and main.
 *
 * The renderer only reports that a workspace switch happened (with the
 * before/after workspace info); the main process owns the agent runtime,
 * the Eve server child process, and the browser tools. Nothing here
 * imports Eve or Electron.
 */

export interface AgentWorkspaceInfo {
  id: string
  name: string
  /** What the user wants to get done in this workspace; may be empty. */
  goal: string
}

export interface AgentTabInfo {
  title: string
  url: string
}

/** A workspace switch as the agent should see it: before → after. */
export interface WorkspaceSwitchNotice {
  from: AgentWorkspaceInfo | null
  to: AgentWorkspaceInfo
  /** Tabs that were open in the outgoing workspace. */
  outgoingTabs: AgentTabInfo[]
  /** Tabs the switch plan opened in the incoming workspace. */
  incomingTabs: AgentTabInfo[]
}

export type AgentRunStatus = 'completed' | 'awaiting-input' | 'failed' | 'cancelled' | 'skipped'

export interface AgentRunResult {
  status: AgentRunStatus
  reply: string | null
  /** Runtime that produced the run (e.g. `eve`), when a run happened. */
  runtime?: string
  /** Why no run happened, when `status` is `skipped`. */
  reason?: string
}

export interface EmbeddedAgent {
  /** Report a workspace switch; the agent runs against the now-active workspace. Never rejects. */
  workspaceSwitched(notice: WorkspaceSwitchNotice): Promise<AgentRunResult>
}

export const AGENT_IPC = {
  workspaceSwitched: 'agent:workspace-switched'
} as const
