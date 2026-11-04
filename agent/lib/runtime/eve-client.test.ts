import { describe, expect, it } from 'vitest'
import type { SessionStreamEvent } from 'eve/client'
import { EveStreamMapper } from './eve-client'

const ev = (type: string, data: unknown): SessionStreamEvent =>
  ({ type, data, meta: { position: 0, at: '' } }) as unknown as SessionStreamEvent

describe('EveStreamMapper', () => {
  it('streams text deltas, tracking the announced part kind', () => {
    const m = new EveStreamMapper()
    expect(m.map(ev('content.delta', { partId: 'p1', kind: 'text', delta: 'Hel' }))).toEqual({ type: 'text-delta', text: 'Hel' })
    expect(m.map(ev('content.delta', { partId: 'p1', delta: 'lo' }))).toEqual({ type: 'text-delta', text: 'lo' })
  })

  it('drops reasoning deltas', () => {
    const m = new EveStreamMapper()
    expect(m.map(ev('content.delta', { partId: 'p1', kind: 'reasoning', delta: 'hmm' }))).toBeNull()
    expect(m.map(ev('content.delta', { partId: 'p1', delta: 'more' }))).toBeNull()
  })

  it('maps tool calls and joins the name onto the settled result', () => {
    const m = new EveStreamMapper()
    expect(
      m.map(ev('call.requested', { callId: 'c1', capability: { kind: 'tool', name: 'open_tab' }, input: { url: 'https://youtube.com' } }))
    ).toEqual({ type: 'tool-call', id: 'c1', name: 'open_tab', input: { url: 'https://youtube.com' } })
    expect(m.map(ev('call.settled', { callId: 'c1', outcome: 'completed' }))).toEqual({
      type: 'tool-result',
      id: 'c1',
      name: 'open_tab',
      outcome: 'completed',
      error: undefined
    })
  })

  it('ignores non-tool calls and unknown settled calls', () => {
    const m = new EveStreamMapper()
    expect(m.map(ev('call.requested', { callId: 'c1', capability: { kind: 'control', name: 'wait' } }))).toBeNull()
    expect(m.map(ev('call.settled', { callId: 'c1', outcome: 'completed' }))).toBeNull()
    expect(m.map(ev('turn.started', {}))).toBeNull()
  })

  it('surfaces tool errors', () => {
    const m = new EveStreamMapper()
    m.map(ev('call.requested', { callId: 'c1', capability: { kind: 'tool', name: 'navigate' } }))
    expect(m.map(ev('call.settled', { callId: 'c1', outcome: 'failed', error: { code: 'x', message: 'no tab' } }))).toMatchObject({
      type: 'tool-result',
      outcome: 'failed',
      error: 'no tab'
    })
  })
})
