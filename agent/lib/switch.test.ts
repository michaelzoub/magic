import { describe, expect, it } from 'vitest'
import { buildWorkspaceSwitchPrompt } from './switch'

describe('buildWorkspaceSwitchPrompt', () => {
  it('feeds the before and after workspace name and goal to the agent', () => {
    const prompt = buildWorkspaceSwitchPrompt({
      from: { id: 'work', name: 'Work', goal: 'Get work projects done' },
      to: { id: 'school', name: 'School', goal: 'Finish coursework and research' },
      outgoingTabs: [{ title: 'Jira', url: 'https://jira.example' }],
      incomingTabs: [{ title: 'MDN', url: 'https://developer.mozilla.org' }]
    })
    expect(prompt).toContain('Previous workspace: "Work"')
    expect(prompt).toContain('Goal: Get work projects done')
    expect(prompt).toContain('New active workspace: "School"')
    expect(prompt).toContain('Goal: Finish coursework and research')
    expect(prompt).toContain('Jira — https://jira.example')
    expect(prompt).toContain('MDN — https://developer.mozilla.org')
    expect(prompt).toContain('list_tabs')
  })

  it('handles a first workspace and missing goals', () => {
    const prompt = buildWorkspaceSwitchPrompt({
      from: null,
      to: { id: 'w1', name: 'Fresh', goal: '' },
      outgoingTabs: [],
      incomingTabs: []
    })
    expect(prompt).toContain('Previous workspace: (none')
    expect(prompt).toContain('(no goal set)')
    expect(prompt).toContain('Tabs now open in the new workspace: (none)')
  })
})
