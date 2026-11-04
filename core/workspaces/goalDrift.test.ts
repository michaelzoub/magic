import { describe, expect, it } from 'vitest'
import { GoalDriftTracker, isAgentJudgeableTab } from './goalDrift'

describe('isAgentJudgeableTab', () => {
  it('lets the agent judge ordinary web pages', () => {
    expect(isAgentJudgeableTab('https://x.com/home')).toBe(true)
    expect(isAgentJudgeableTab('https://arxiv.org/abs/2401.1')).toBe(true)
    expect(isAgentJudgeableTab('https://youtube.com/watch?v=1')).toBe(true)
  })

  it('stays unknown (no agent run) for blank/internal pages and search engines', () => {
    expect(isAgentJudgeableTab('')).toBe(false)
    expect(isAgentJudgeableTab('about:blank')).toBe(false)
    expect(isAgentJudgeableTab('https://www.google.com/search?q=cats')).toBe(false)
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
    expect(tracker.isJudged('t0', 'https://youtube.com/')).toBe(true)
    expect(tracker.observe('t0', 'https://youtube.com/', 'unrelated').streak).toBe(0)
    tracker.observe('t1', 'https://youtube.com/', 'unrelated')
    expect(tracker.observe('t1', 'https://youtube.com/', 'unrelated').streak).toBe(1)
    // The same tab navigating somewhere new is a fresh judgement.
    expect(tracker.observe('t1', 'https://espn.com/', 'unrelated').shouldExit).toBe(true)
  })
})
