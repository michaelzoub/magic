/**
 * Workspace goal-drift bookkeeping.
 *
 * Whether a tab is unrelated to the active workspace's goal is decided
 * by the agent (see `agent/lib/drift.ts`), never by a local heuristic:
 * no agent verdict — skipped, failed, or unparseable — means `unknown`,
 * and `unknown` never triggers the drift warning. This module only keeps
 * the cheap pre-filter for tabs no judge could assess (blank/internal
 * pages, search engines) and the consecutive-unrelated streak counting.
 */

import type { GoalDriftVerdict } from '@shared/agent'

export type { GoalDriftVerdict }

const SEARCH_HOSTS = ['google.', 'bing.com', 'duckduckgo.com', 'search.brave.com', 'kagi.com', 'startpage.com', 'ecosia.org', 'yahoo.']

const hostOf = (url: string): string => {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Whether the agent should be asked to judge this tab at all. Blank and
 * internal pages carry no signal, and a search engine is a waypoint, not
 * a destination — those stay `unknown` without spending an agent run.
 * Every other verdict (`related` / `unrelated`) comes from the agent.
 */
export function isAgentJudgeableTab(url: string): boolean {
  const host = hostOf(url)
  if (!url.trim() || !host || /^(about|chrome|magic|data|blob|file):/.test(url.toLowerCase())) return false
  return !SEARCH_HOSTS.some((s) => host === s.replace(/\.$/, '') || host.startsWith(s) || host.endsWith(`.${s.replace(/\.$/, '')}`))
}

/**
 * Counts consecutive model-judged unrelated tab navigations in one
 * workspace. `unknown` navigations neither advance nor reset the streak;
 * a related one resets it. Each tab+URL is judged once, so snapshot
 * re-renders and title updates never double-count. `prime` marks
 * already-open tabs as seen without judging them (tabs restored on
 * switch/launch are not user drift).
 */
export class GoalDriftTracker {
  private readonly seen = new Set<string>()
  private streak = 0

  constructor(private readonly threshold = 2) {}

  private key(tabId: string, url: string): string {
    return `${tabId}|${url}`
  }

  prime(tabId: string, url: string): void {
    this.seen.add(this.key(tabId, url))
  }

  /** Whether this tab+URL has already been primed or judged. */
  isJudged(tabId: string, url: string): boolean {
    return this.seen.has(this.key(tabId, url))
  }

  observe(tabId: string, url: string, verdict: GoalDriftVerdict): { streak: number; shouldExit: boolean } {
    const key = this.key(tabId, url)
    if (this.seen.has(key)) return { streak: this.streak, shouldExit: false }
    this.seen.add(key)
    if (verdict === 'related') this.streak = 0
    else if (verdict === 'unrelated') this.streak += 1
    return { streak: this.streak, shouldExit: this.streak >= this.threshold }
  }

  /** Restart the unrelated streak but keep already-judged tabs judged. */
  resetStreak(): void {
    this.streak = 0
  }

  reset(): void {
    this.seen.clear()
    this.streak = 0
  }
}
