import { describe, expect, it } from 'vitest'
import type { AgentSwitchNoticeState } from '@shared/agent'
import { agentNoticePriority, orderNotifications, queuedNotifications, visibleNotification } from './ordering'

const agent = (phase: AgentSwitchNoticeState['phase'], proposals: AgentSwitchNoticeState['proposals'] = []): AgentSwitchNoticeState => ({
  id: '1',
  fromName: 'Work',
  toName: 'School',
  phase,
  traces: [],
  reply: null,
  proposals
})
const proposal = { kind: 'open', url: 'https://example.com' } as const
const drift = { workspaceName: 'School' }

describe('notification ordering', () => {
  it('shows nothing when nothing is pending', () => {
    expect(visibleNotification({ agent: null, drift: null })).toBeNull()
    expect(orderNotifications({ agent: null, drift: null })).toEqual([])
  })

  it('shows the drift toast when it is the only notification', () => {
    expect(visibleNotification({ agent: null, drift })).toBe('drift')
    expect(queuedNotifications({ agent: null, drift })).toEqual([])
  })

  it('an agent notice awaiting a decision pre-empts drift, which queues behind it', () => {
    const input = { agent: agent('done', [proposal]), drift }
    expect(visibleNotification(input)).toBe('agent')
    expect(queuedNotifications(input)).toEqual(['drift'])
    // Once the agent notice clears, the queued drift becomes visible.
    expect(visibleNotification({ agent: null, drift })).toBe('drift')
  })

  it('running and failed agent notices also outrank the passive drift warning', () => {
    expect(visibleNotification({ agent: agent('running'), drift })).toBe('agent')
    expect(visibleNotification({ agent: agent('failed'), drift })).toBe('agent')
    expect(agentNoticePriority(agent('running'))).toBeGreaterThan(agentNoticePriority(agent('done')))
  })

  it('ranks priorities: proposals > failed > running > informational > drift', () => {
    expect(agentNoticePriority(agent('done', [proposal]))).toBe(40)
    expect(agentNoticePriority(agent('failed'))).toBe(30)
    expect(agentNoticePriority(agent('running'))).toBe(20)
    expect(agentNoticePriority(agent('done'))).toBe(15)
    expect(agentNoticePriority(agent('skipped'))).toBe(15)
    expect(orderNotifications({ agent: agent('done', [proposal]), drift })).toEqual([
      { kind: 'agent', priority: 40 },
      { kind: 'drift', priority: 10 }
    ])
  })
})
