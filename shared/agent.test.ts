import { describe, expect, it } from 'vitest'
import { canAssistanceRestructure, isSiteExcluded, normalizeSiteExclusion } from './agent'

describe('background assistance gating', () => {
  it('inactive assistance cannot restructure anything', () => {
    expect(canAssistanceRestructure({ active: false, excludedSites: [], excludedWorkspaceIds: [] }, 'work')).toBe(false)
  })

  it('an excluded workspace cannot be restructured, others can', () => {
    const settings = { active: true, excludedSites: [], excludedWorkspaceIds: ['work'] }
    expect(canAssistanceRestructure(settings, 'work')).toBe(false)
    expect(canAssistanceRestructure(settings, 'school')).toBe(true)
  })

  it('normalizes site exclusions to hostnames', () => {
    expect(normalizeSiteExclusion('https://www.YouTube.com/watch?v=1')).toBe('www.youtube.com')
    expect(normalizeSiteExclusion('example.com/path')).toBe('example.com')
    expect(normalizeSiteExclusion('  ')).toBeNull()
  })

  it('matches excluded sites and their subdomains only', () => {
    expect(isSiteExcluded('https://www.youtube.com/watch', ['youtube.com'])).toBe(true)
    expect(isSiteExcluded('https://notyoutube.com/', ['youtube.com'])).toBe(false)
    expect(isSiteExcluded('not a url', ['youtube.com'])).toBe(false)
  })
})
