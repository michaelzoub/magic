import { describe, expect, it } from 'vitest'
import { feedbackForAgentEvent } from './agentFeedback'

describe('feedbackForAgentEvent', () => {
  it('marks the target workspace as preparing on a switch_workspace call', () => {
    expect(
      feedbackForAgentEvent({ type: 'tool-call', id: '1', name: 'switch_workspace', input: { workspaceId: 'design' } }, 't1')
    ).toEqual({ kind: 'workspace-preparing', workspaceId: 'design' })
  })

  it('clears (never celebrates) a failed workspace switch', () => {
    expect(feedbackForAgentEvent({ type: 'tool-result', id: '1', name: 'switch_workspace', outcome: 'failed' }, 't1')).toEqual({
      kind: 'workspace-failed'
    })
    expect(feedbackForAgentEvent({ type: 'tool-result', id: '1', name: 'switch_workspace', outcome: 'completed' }, 't1')).toBeNull()
  })

  it('targets the active tab for a navigate call without an explicit tabId', () => {
    expect(
      feedbackForAgentEvent({ type: 'tool-call', id: '2', name: 'navigate', input: { url: 'https://example.com' } }, 'active-tab')
    ).toEqual({ kind: 'tab', tabId: 'active-tab', tabKind: 'reused' })
  })

  it('targets the explicit tab for switch_tab and close_tab', () => {
    expect(feedbackForAgentEvent({ type: 'tool-call', id: '3', name: 'switch_tab', input: { tabId: 't9' } }, 't1')).toEqual({
      kind: 'tab', tabId: 't9', tabKind: 'reused'
    })
    expect(feedbackForAgentEvent({ type: 'tool-call', id: '4', name: 'close_tab', input: { tabId: 't9' } }, 't1')).toEqual({
      kind: 'tab', tabId: 't9', tabKind: 'removed'
    })
  })

  it('ignores reply text, read-only tools, and tab calls with no resolvable tab', () => {
    expect(feedbackForAgentEvent({ type: 'text-delta', text: 'hi' }, 't1')).toBeNull()
    expect(feedbackForAgentEvent({ type: 'tool-call', id: '5', name: 'list_tabs' }, 't1')).toBeNull()
    expect(feedbackForAgentEvent({ type: 'tool-call', id: '6', name: 'navigate', input: {} }, null)).toBeNull()
  })
})
