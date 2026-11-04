import { describe, expect, it } from 'vitest'
import { describeAgentEvent, describeProposal, describeProposalDetail, groupProposals } from './agentNotice'

describe('describeAgentEvent', () => {
  it('keeps only important traces: checks, proposed tab changes, failures', () => {
    expect(describeAgentEvent({ type: 'tool-call', id: '1', name: 'list_tabs' })).toBe('Checking open tabs')
    expect(describeAgentEvent({ type: 'tool-call', id: '2', name: 'open_tab', input: { url: 'https://www.example.com/docs' } })).toBe('Proposing to open example.com')
    expect(describeAgentEvent({ type: 'tool-call', id: '3', name: 'close_tab', input: { tabId: 'x' } })).toBe('Proposing to close a tab')
    expect(describeAgentEvent({ type: 'tool-result', id: '2', name: 'open_tab', outcome: 'completed' })).toBeNull()
    expect(describeAgentEvent({ type: 'tool-result', id: '2', name: 'open_tab', outcome: 'failed', error: 'nope' })).toContain('failed')
    expect(describeAgentEvent({ type: 'text-delta', text: 'thinking…' })).toBeNull()
    expect(describeAgentEvent({ type: 'tool-call', id: '4', name: 'switch_tab', input: { tabId: 'x' } })).toBeNull()
  })
})

describe('describeProposal', () => {
  it('renders proposals as open/close lines', () => {
    expect(describeProposal({ kind: 'open', url: 'https://www.example.com/x' })).toBe('Open example.com')
    expect(describeProposal({ kind: 'close', tabId: 'a', title: 'Docs', url: 'https://example.com' })).toBe('Close Docs')
    expect(describeProposal({ kind: 'navigate', tabId: 'a', title: 'Docs', url: 'https://example.com' })).toBe('Open example.com in Docs')
  })
})

describe('groupProposals / describeProposalDetail', () => {
  it('groups by kind in open → navigate → close order, omitting empty groups', () => {
    const groups = groupProposals([
      { kind: 'close', tabId: 'a', title: 'Docs', url: 'https://example.com' },
      { kind: 'open', url: 'https://www.figma.com/file' },
      { kind: 'open', url: 'https://dribbble.com' }
    ])
    expect(groups.map((g) => [g.kind, g.proposals.length])).toEqual([['open', 2], ['close', 1]])
  })

  it('gives title + detail per proposal kind', () => {
    expect(describeProposalDetail({ kind: 'open', url: 'https://www.figma.com/file' })).toEqual({ title: 'figma.com', detail: 'https://www.figma.com/file' })
    expect(describeProposalDetail({ kind: 'close', tabId: 'a', title: 'Docs', url: 'https://example.com' })).toEqual({ title: 'Docs', detail: 'https://example.com' })
    expect(describeProposalDetail({ kind: 'navigate', tabId: 'a', title: 'Docs', url: 'https://example.com' })).toEqual({ title: 'example.com', detail: 'In Docs' })
  })
})
