import { describe, expect, it } from 'vitest'
import { buildAgentChatPrompt } from './chat'

describe('buildAgentChatPrompt', () => {
  it('includes the question, workspace, and open tabs', () => {
    const prompt = buildAgentChatPrompt('  Summarize my docs tab  ', {
      workspace: { id: 'w1', name: 'School', goal: 'Write the essay' },
      tabs: [{ title: 'Docs', url: 'https://example.com/docs' }]
    })
    expect(prompt).toContain('User question: Summarize my docs tab')
    expect(prompt).toContain('"School"')
    expect(prompt).toContain('Write the essay')
    expect(prompt).toContain('https://example.com/docs')
    expect(prompt).toContain('list_tabs')
    expect(prompt).toContain('Never ask the user a question')
    expect(prompt).toContain('Just execute')
  })

  it('handles no workspace and no tabs', () => {
    const prompt = buildAgentChatPrompt('Open example.com', { workspace: null, tabs: [] })
    expect(prompt).toContain('Active workspace: (none)')
    expect(prompt).toContain('Tabs open in the active workspace: (none)')
  })
})
