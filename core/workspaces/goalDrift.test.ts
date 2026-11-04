import { describe, expect, it } from 'vitest'
import { assessTabAgainstGoal, GoalDriftTracker } from './goalDrift'

const research = { name: 'Research', goal: 'Read papers For Research, sites include arxiv.org, scholar.google.com.' }

describe('assessTabAgainstGoal', () => {
  it('treats sites named in the goal (and their subdomains) as related', () => {
    expect(assessTabAgainstGoal(research, { url: 'https://arxiv.org/abs/2401.1', title: 'A paper' }).verdict).toBe('related')
    expect(assessTabAgainstGoal(research, { url: 'https://www.scholar.google.com/citations', title: '' }).verdict).toBe('related')
  })

  it('treats goal keyword overlap in title/URL as related', () => {
    const work = { name: 'Work', goal: 'Ship the v2 launch with the design team' }
    expect(assessTabAgainstGoal(work, { url: 'https://figma.com/file/1', title: 'V2 launch designs' }).verdict).toBe('related')
  })

  it('calls a tab with no site or keyword overlap unrelated when the goal is specific', () => {
    expect(assessTabAgainstGoal(research, { url: 'https://youtube.com/watch?v=1', title: 'Funny cats' }).verdict).toBe('unrelated')
    expect(assessTabAgainstGoal(research, { url: 'https://espn.com/nba', title: 'Scores' }).verdict).toBe('unrelated')
  })

  it('stays unknown for blank/internal pages and search engines', () => {
    expect(assessTabAgainstGoal(research, { url: '', title: 'New Tab' }).verdict).toBe('unknown')
    expect(assessTabAgainstGoal(research, { url: 'about:blank', title: '' }).verdict).toBe('unknown')
    expect(assessTabAgainstGoal(research, { url: 'https://www.google.com/search?q=cats', title: 'cats' }).verdict).toBe('unknown')
  })

  it('judges even the short seed goals (two content words is enough)', () => {
    const work = { name: 'Work', goal: 'Get work projects done' }
    expect(assessTabAgainstGoal(work, { url: 'https://youtube.com/watch?v=1', title: 'Funny cats' }).verdict).toBe('unrelated')
    expect(assessTabAgainstGoal(work, { url: 'https://github.com/acme', title: 'Project board' }).verdict).toBe('related')
  })

  it('stays unknown when the goal is too vague to judge', () => {
    const vague = { name: 'Personal', goal: 'Browsing' }
    expect(assessTabAgainstGoal(vague, { url: 'https://youtube.com/watch?v=1', title: 'Funny cats' }).verdict).toBe('unknown')
    expect(assessTabAgainstGoal({ name: 'Misc', goal: '' }, { url: 'https://espn.com/', title: 'Scores' }).verdict).toBe('unknown')
  })
})

describe('GoalDriftTracker', () => {
  it('exits only after the threshold of consecutive unrelated navigations', () => {
    const tracker = new GoalDriftTracker(2)
    expect(tracker.observe('t1', 'https://youtube.com/', 'unrelated')).toEqual({ streak: 1, shouldExit: false })
    expect(tracker.observe('t2', 'https://espn.com/', 'unrelated')).toEqual({ streak: 2, shouldExit: true })
  })

  it('a related navigation resets the streak; unknown leaves it untouched', () => {
    const tracker = new GoalDriftTracker(2)
    tracker.observe('t1', 'https://youtube.com/', 'unrelated')
    expect(tracker.observe('t2', 'https://google.com/search?q=x', 'unknown').streak).toBe(1)
    expect(tracker.observe('t3', 'https://arxiv.org/', 'related').streak).toBe(0)
    expect(tracker.observe('t4', 'https://espn.com/', 'unrelated').shouldExit).toBe(false)
  })

  it('judges each tab+URL once and never judges primed tabs', () => {
    const tracker = new GoalDriftTracker(2)
    tracker.prime('t0', 'https://youtube.com/')
    expect(tracker.observe('t0', 'https://youtube.com/', 'unrelated').streak).toBe(0)
    tracker.observe('t1', 'https://youtube.com/', 'unrelated')
    expect(tracker.observe('t1', 'https://youtube.com/', 'unrelated').streak).toBe(1)
    // The same tab navigating somewhere new is a fresh judgement.
    expect(tracker.observe('t1', 'https://espn.com/', 'unrelated').shouldExit).toBe(true)
  })
})
