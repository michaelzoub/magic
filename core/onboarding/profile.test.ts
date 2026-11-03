import { describe, expect, it } from 'vitest'
import { buildCompleteOnboardingInput } from './profile'

describe('buildCompleteOnboardingInput', () => {
  it('maps name/goal to the profile and every other answer to initial settings', () => {
    const input = buildCompleteOnboardingInput({ name: ' Ada ', goal: 'Focus', theme: 'dark', level: 2 }, 1000)
    expect(input).toEqual({
      profile: { displayName: 'Ada', goal: 'Focus' },
      settings: { defaultGoal: 'Focus', theme: 'dark', level: 2 },
      completedAt: 1000
    })
  })

  it('maps the welcome step to the display name and a description setting', () => {
    const input = buildCompleteOnboardingInput(
      { welcome: { name: ' Alex ', description: ' A student and builder. ' }, goal: 'Focus' },
      1000
    )
    expect(input).toEqual({
      profile: { displayName: 'Alex', goal: 'Focus' },
      settings: { defaultGoal: 'Focus', description: 'A student and builder.' },
      completedAt: 1000
    })
    expect(() => buildCompleteOnboardingInput({ welcome: { name: ' ', description: 'x' } })).toThrow(/requires a name/)
  })

  it('maps multi-select goals: first goal is the profile goal, all are seeded as a setting', () => {
    const input = buildCompleteOnboardingInput(
      {
        welcome: { name: 'Alex', description: 'A builder.' },
        goals: {
          options: ['Work', 'Music'],
          selected: [
            { name: ' Work ', goal: ' Ship v2 ' },
            { name: 'Music', goal: 'Release an EP' }
          ]
        }
      },
      1000
    )
    expect(input.profile).toEqual({ displayName: 'Alex', goal: 'Ship v2' })
    expect(input.settings).toEqual({
      defaultGoal: 'Ship v2',
      description: 'A builder.',
      goals: [
        { name: 'Work', goal: 'Ship v2' },
        { name: 'Music', goal: 'Release an EP' }
      ]
    })
  })

  it('concatenates each workspace’s sites into its actual goal text', () => {
    const input = buildCompleteOnboardingInput(
      {
        welcome: { name: 'Alex', description: 'A builder.' },
        goals: {
          options: ['Research', 'Work'],
          selected: [
            { name: 'Research', goal: 'Read papers' },
            { name: 'Work', goal: 'Ship v2' }
          ]
        },
        sites: { Research: ['arxiv.org', ' arxiv.org ', 'scholar.google.com'], Work: ['gmail.com'] }
      },
      1000
    )
    expect(input.profile.goal).toBe('Read papers For Research, sites include arxiv.org, scholar.google.com.')
    expect(input.settings.goals).toEqual([
      { name: 'Research', goal: 'Read papers For Research, sites include arxiv.org, scholar.google.com.' },
      { name: 'Work', goal: 'Ship v2 For Work, sites include gmail.com.' }
    ])
    expect(input.settings.sites).toEqual({ Research: ['arxiv.org', 'arxiv.org', 'scholar.google.com'], Work: ['gmail.com'] })
  })

  it('saves the goal text edited in step 3 instead of recomposing it', () => {
    const input = buildCompleteOnboardingInput(
      {
        welcome: { name: 'Alex', description: 'A builder.' },
        goals: { options: ['Research'], selected: [{ name: 'Research', goal: 'Read papers' }] },
        sites: { Research: { sites: ['arxiv.org'], goalText: 'Keep up with ML papers, mostly on arxiv.' } }
      },
      1000
    )
    expect(input.settings.goals).toEqual([{ name: 'Research', goal: 'Keep up with ML papers, mostly on arxiv.' }])
    expect(input.settings.sites).toEqual({ Research: ['arxiv.org'] })
  })

  it('requires a name and rejects non-JSON-serializable answers', () => {
    expect(() => buildCompleteOnboardingInput({ goal: 'Focus' })).toThrow(/requires a name/)
    expect(() => buildCompleteOnboardingInput({ name: 'Ada', cb: () => {} })).toThrow(/not JSON-serializable/)
  })
})
