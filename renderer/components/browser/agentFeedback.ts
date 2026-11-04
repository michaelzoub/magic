import type { AgentStreamEvent } from '@shared/agent'

export type AgentFeedback =
  | { kind: 'workspace-preparing'; workspaceId: string }
  | { kind: 'workspace-failed' }
  | { kind: 'tab'; tabId: string; tabKind: 'reused' | 'removed' }

const inputOf = (event: AgentStreamEvent): Record<string, unknown> =>
  event.type === 'tool-call' && event.input && typeof event.input === 'object' ? (event.input as Record<string, unknown>) : {}

/**
 * Map a live agent stream event to the UI attention it should produce.
 * Only real tool calls/results produce feedback; reply text and read-only
 * tools produce none. Tool calls without an explicit tab target the
 * currently active tab, which is the tool runtime's own default.
 */
export function feedbackForAgentEvent(event: AgentStreamEvent, activeTabId: string | null): AgentFeedback | null {
  const input = inputOf(event)
  if (event.type === 'tool-call' && event.name === 'switch_workspace') {
    return typeof input.workspaceId === 'string' ? { kind: 'workspace-preparing', workspaceId: input.workspaceId } : null
  }
  if (event.type === 'tool-result' && event.name === 'switch_workspace') {
    // Success is owned by the switch enactment itself; only failure clears.
    return event.outcome === 'completed' ? null : { kind: 'workspace-failed' }
  }
  if (event.type !== 'tool-call') return null
  const tabId = typeof input.tabId === 'string' ? input.tabId : activeTabId
  if (!tabId) return null
  if (event.name === 'navigate' || event.name === 'switch_tab') return { kind: 'tab', tabId, tabKind: 'reused' }
  if (event.name === 'close_tab') return { kind: 'tab', tabId, tabKind: 'removed' }
  return null
}
