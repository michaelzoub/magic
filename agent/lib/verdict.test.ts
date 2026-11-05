import { describe, expect, it } from 'vitest'
import { buildAgentChatPrompt } from './chat'
import { buildWorkspaceSwitchPrompt } from './switch'
import { extractCheckpointVerdict } from './verdict'

describe('extractCheckpointVerdict', () => {
  it('parses the verdict line and strips it from the reply', () => {
    const { reply, verdict } = extractCheckpointVerdict(
      'Opened your course tabs.\nCHECKPOINT_VERDICT: {"meaningful":true,"reason":"Set up a study tab set"}'
    )
    expect(reply).toBe('Opened your course tabs.')
    expect(verdict).toEqual({ meaningful: true, reason: 'Set up a study tab set' })
  })

  it('parses a not-meaningful verdict', () => {
    const { verdict } = extractCheckpointVerdict('Nothing to change.\nCHECKPOINT_VERDICT: {"meaningful":false,"reason":"Bounce switch"}')
    expect(verdict).toEqual({ meaningful: false, reason: 'Bounce switch' })
  })

  it('returns no verdict (but keeps the reply) when the agent did not judge', () => {
    const { reply, verdict } = extractCheckpointVerdict('Plain summary with no verdict.')
    expect(reply).toBe('Plain summary with no verdict.')
    expect(verdict).toBeNull()
  })

  it('treats an unparseable verdict line as no judgment and strips it', () => {
    const { reply, verdict } = extractCheckpointVerdict('Done.\nCHECKPOINT_VERDICT: maybe')
    expect(reply).toBe('Done.')
    expect(verdict).toBeNull()
  })

  it('handles an empty reply', () => {
    expect(extractCheckpointVerdict(null)).toEqual({ reply: null, verdict: null })
  })
})

describe('prompts ask the agent to judge the checkpoint', () => {
  it('switch prompt includes examples and the verdict format', () => {
    const prompt = buildWorkspaceSwitchPrompt({
      from: { id: 'work', name: 'Work', goal: 'Ship' },
      to: { id: 'school', name: 'School', goal: 'Study' },
      outgoingTabs: [],
      incomingTabs: []
    })
    expect(prompt).toContain('Checkpoint judgment')
    expect(prompt).toContain('switch between two different workspaces')
    expect(prompt).toContain('CHECKPOINT_VERDICT:')
  })

  it('switch prompt treats a real context switch as meaningful even with no proposals', () => {
    const prompt = buildWorkspaceSwitchPrompt({
      from: { id: 'math', name: 'Deep Work on math', goal: 'Get good at math' },
      to: { id: 'design', name: 'Design Inspo', goal: 'Browse Cosmos, X, YouTube' },
      outgoingTabs: [{ title: 'Khan Academy', url: 'https://www.khanacademy.org/' }],
      incomingTabs: [{ title: 'Cosmos', url: 'https://www.cosmos.so/' }]
    })
    expect(prompt).toContain('even if you propose no changes at all')
    expect(prompt).toContain('When in doubt, judge it meaningful')
    expect(prompt).toContain('Always end your reply')
    expect(prompt).not.toContain('the same tabs remain open afterwards')
  })

  it('chat prompt treats asking a Magic chat question as judgeable', () => {
    const prompt = buildAgentChatPrompt('Plan my trip', { workspace: { id: 'w', name: 'Travel', goal: '' }, tabs: [] })
    expect(prompt).toContain('Checkpoint judgment')
    expect(prompt).toContain('asked a question in the Magic chat')
    expect(prompt).toContain('CHECKPOINT_VERDICT:')
  })
})
