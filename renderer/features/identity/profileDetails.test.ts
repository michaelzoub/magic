import { describe, expect, it } from 'vitest'
import type { CompletedOnboarding } from '@shared/onboarding'
import { parseSitesInput, profileDetails, stripComposedSites } from './profileDetails'

const completed = (settings: CompletedOnboarding['settings'], goal = ''): CompletedOnboarding => ({
  profile: { displayName: 'Ada', goal, identitySeed: 'v1.00000008', onboardingCompletedAt: 1000, createdAt: 1000, updatedAt: 1000 },
  settings
})

describe('stripComposedSites', () => {
  it('removes the composed "For <area>, sites include …" suffix', () => {
    expect(stripComposedSites('Ship v2 For Work, sites include gmail.com, notion.so.', 'Work')).toBe('Ship v2')
    expect(stripComposedSites('For Work, sites include gmail.com.', 'Work')).toBe('')
  })

  it('leaves user-edited goal text untouched', () => {
    expect(stripComposedSites('Keep up with ML papers, mostly on arxiv.', 'Research')).toBe(
      'Keep up with ML papers, mostly on arxiv.'
    )
    expect(stripComposedSites('Ship v2 for work, sites include gmail.com', 'Work')).toBe('Ship v2 for work, sites include gmail.com')
  })
})

describe('parseSitesInput', () => {
  it('splits, trims, and de-duplicates case-insensitively', () => {
    expect(parseSitesInput(' gmail.com, Gmail.com\nnotion.so, , gmail.com ')).toEqual(['gmail.com', 'notion.so'])
    expect(parseSitesInput('')).toEqual([])
  })
})

describe('profileDetails', () => {
  it('structures stored goals and sites into areas, goals, and site groups', () => {
    const details = profileDetails(
      completed({
        goals: [
          { name: 'Research', goal: 'Read papers For Research, sites include arxiv.org, scholar.google.com.' },
          { name: 'Work', goal: 'Ship v2' }
        ],
        sites: { Research: ['arxiv.org', 'arxiv.org', 'scholar.google.com'], Work: ['gmail.com'] }
      })
    )
    expect(details.areas).toEqual(['Research', 'Work'])
    expect(details.goals).toEqual([
      { name: 'Research', goal: 'Read papers' },
      { name: 'Work', goal: 'Ship v2' }
    ])
    expect(details.sitesByArea).toEqual([
      { area: 'Research', sites: ['arxiv.org', 'scholar.google.com'] },
      { area: 'Work', sites: ['gmail.com'] }
    ])
    expect(details.sites).toEqual(['arxiv.org', 'scholar.google.com', 'gmail.com'])
  })

  it('adds site-only areas as focus areas and falls back to the profile goal', () => {
    expect(profileDetails(completed({ sites: { Music: ['bandcamp.com'] } })).goals).toEqual([{ name: 'Music', goal: '' }])
    expect(profileDetails(completed({}, 'Focus deeply')).goals).toEqual([{ name: '', goal: 'Focus deeply' }])
    expect(profileDetails(null)).toEqual({ areas: [], goals: [], sitesByArea: [], sites: [] })
  })
})
