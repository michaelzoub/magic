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

/**
 * One tab change the switch agent wants to make. Switch runs are staged:
 * the agent's open/close/navigate tool calls are collected as proposals
 * instead of being enacted, and only run when the user approves them.
 */
export type AgentTabProposal =
  | { kind: 'open'; url: string }
  | { kind: 'close'; tabId: string; title: string; url: string }
  | { kind: 'navigate'; tabId: string; title: string; url: string }

/**
 * The agent's judgment of whether the moment a run belongs to (a workspace
 * switch, a Magic chat turn) is a meaningful checkpoint worth showing the
 * user in Memory. Everything is saved regardless; this only gates display.
 */
export interface CheckpointVerdict {
  meaningful: boolean
  /** Short reason for the verdict, shown for debugging/log output. */
  reason: string | null
}

export interface AgentRunResult {
  status: AgentRunStatus
  reply: string | null
  /** Set when the run judged its moment as a checkpoint (switch/chat runs). */
  checkpointVerdict?: CheckpointVerdict | null
  /** Staged tab changes awaiting user approval (workspace-switch runs). */
  proposals?: AgentTabProposal[]
  /** Runtime that produced the run (e.g. `eve`), when a run happened. */
  runtime?: string
  /** Why no run happened, when `status` is `skipped`. */
  reason?: string
  /** Conversation session this turn belongs to; follow-ups continue it. */
  sessionId?: string
}

/** One live event from a streaming chat turn. Serializable; crosses IPC as-is. */
export type AgentStreamEvent =
  /** A chunk of the agent's reply text (append to the streaming bubble). */
  | { type: 'text-delta'; text: string }
  /** The agent invoked a tool; show it as running until its tool-result arrives. */
  | { type: 'tool-call'; id: string; name: string; input?: unknown }
  /** A tool call settled. `outcome` mirrors the runtime's outcome vocabulary. */
  | { type: 'tool-result'; id: string; name?: string; outcome: string; error?: string }

export type AgentStreamListener = (event: AgentStreamEvent) => void

/** Serializable context the shell hands the agent alongside a chat question. */
export interface AgentChatContext {
  workspace: AgentWorkspaceInfo | null
  /** Tabs currently open in the active workspace (excluded sites are stripped in main). */
  tabs: AgentTabInfo[]
}

/**
 * Global background-assistance state. One state for the whole app: when
 * inactive — or when the target workspace / a tab's site is excluded — the
 * agent may not restructure anything (open/close/move tabs or reorganize a
 * workspace). Ordinary browsing, workspace switching, and session
 * restoration never consult this state.
 */
export interface AssistanceSettings {
  active: boolean
  /** Hostnames (e.g. `youtube.com`); tabs on these sites are invisible to the agent. */
  excludedSites: string[]
  /** Workspace ids the agent may not restructure. */
  excludedWorkspaceIds: string[]
}

export const DEFAULT_ASSISTANCE: AssistanceSettings = { active: true, excludedSites: [], excludedWorkspaceIds: [] }

/** One recorded background-assistance event (a run, or why a run was skipped). */
export interface AssistanceActivity {
  id: string
  at: number
  description: string
  status: AgentRunStatus
}

/** Live state of a workspace-switch run, shown in the bottom-center agent notice. */
export interface AgentSwitchNoticeState {
  id: string
  fromName: string | null
  toName: string
  phase: 'running' | 'done' | 'failed' | 'skipped'
  /** User's totem seed, so the running pill can animate their identity in both renderers. */
  identitySeed?: string | null
  /** Important trace lines only (tool activity + failures), newest last. */
  traces: string[]
  reply: string | null
  reason?: string
  proposals: AgentTabProposal[]
}

/** The agent's judgment of one tab against the active workspace's goal. */
export type GoalDriftVerdict = 'related' | 'unrelated' | 'unknown'

export interface DriftTabVerdict {
  tabId: string
  verdict: GoalDriftVerdict
  /** Short reason for the verdict, shown for debugging/log output. */
  reason: string | null
}

/** Tabs the shell asks the model to judge for workspace goal drift (one bare inference call). */
export interface DriftAssessmentRequest {
  workspace: AgentWorkspaceInfo
  tabs: (AgentTabInfo & { id: string })[]
}

export interface DriftAssessmentResult {
  status: AgentRunStatus
  /** One verdict per judged tab; empty when no run happened / nothing was judged. */
  verdicts: DriftTabVerdict[]
  /** Runtime that produced the verdicts (e.g. `eve`), when a run happened. */
  runtime?: string
  /** Why no run happened, when `status` is `skipped`. */
  reason?: string
}

export interface EmbeddedAgent {
  /**
   * Report a workspace switch; the agent runs against the now-active
   * workspace. Mutating tab tools are staged as proposals on the result —
   * nothing is opened/closed until the user approves. `onEvent` receives
   * live stream events (tool calls/results) when the runtime supports it.
   * Never rejects.
   */
  workspaceSwitched(notice: WorkspaceSwitchNotice, onEvent?: AgentStreamListener): Promise<AgentRunResult>
  /**
   * Ask the agent a question from the chatbox. The agent thinks, may drive
   * the browser with its tools, and resolves with its final reply. Turns
   * continue one conversation session per window. Never rejects.
   */
  ask(question: string, context: AgentChatContext, onEvent?: AgentStreamListener): Promise<AgentRunResult>
  /**
   * Ask the model — not a local heuristic, and not an agent run: one bare
   * inference call — whether each given tab is
   * related to the active workspace's goal. Fails soft: a skipped/failed
   * run returns no verdicts, which the shell treats as `unknown` (never
   * as drift). Never rejects.
   */
  assessDrift(request: DriftAssessmentRequest): Promise<DriftAssessmentResult>
  /** Current global background-assistance state. */
  getAssistance(): Promise<AssistanceSettings>
  /** Turn background assistance on/off globally; resolves with the stored state. */
  setAssistanceActive(active: boolean): Promise<AssistanceSettings>
  /** Replace the site/workspace exclusions; resolves with the stored state. */
  setAssistanceExclusions(excludedSites: string[], excludedWorkspaceIds: string[]): Promise<AssistanceSettings>
  /** Recent background-assistance activity, most recent first. */
  listAssistanceActivity(limit?: number): Promise<AssistanceActivity[]>
  /**
   * Subscribe to "a tab is about to be closed by an agent tool call"
   * notices. Fired (and briefly awaited) before the close is enacted, so
   * the shell can paint the tab's removal highlight first. Returns an
   * unsubscribe function.
   */
  onTabClosing(listener: (tabId: string) => void): () => void
}

export const AGENT_IPC = {
  workspaceSwitched: 'agent:workspace-switched',
  /** main -> renderer: one AgentStreamEvent for a switch run, tagged with its request id. */
  workspaceSwitchedEvent: 'agent:workspace-switched:event',
  ask: 'agent:ask',
  assessDrift: 'agent:assess-drift',
  /** main -> asking renderer: one AgentStreamEvent, tagged with the ask's request id. */
  askEvent: 'agent:ask:event',
  /** main -> renderer: an agent tool call is about to close this tab (paint the removal highlight now). */
  tabClosing: 'agent:tab-closing',
  getAssistance: 'agent:assistance:get',
  setAssistanceActive: 'agent:assistance:set-active',
  setAssistanceExclusions: 'agent:assistance:set-exclusions',
  listAssistanceActivity: 'agent:assistance:activity'
} as const

/** Normalize a user-typed site exclusion to a bare hostname, or null when it has none. */
export function normalizeSiteExclusion(input: string): string | null {
  const raw = input.trim().toLowerCase()
  if (!raw) return null
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname || null
  } catch {
    return null
  }
}

/** True when `url`'s hostname equals an exclusion or is a subdomain of one. */
export function isSiteExcluded(url: string, excludedSites: readonly string[]): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return excludedSites.some((site) => host === site || host.endsWith(`.${site}`))
}

/** Whether background assistance may restructure `workspaceId` right now. */
export function canAssistanceRestructure(settings: AssistanceSettings, workspaceId: string | null | undefined): boolean {
  return settings.active && !(workspaceId && settings.excludedWorkspaceIds.includes(workspaceId))
}
