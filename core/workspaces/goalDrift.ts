/**
 * Heuristic drift detection: is a tab plausibly part of a workspace's goal?
 *
 * Pure and deterministic — no model call. Signals come only from the goal
 * text itself: sites named in it (onboarding composes goals as
 * "… For <name>, sites include arxiv.org, scholar.google.com.") and its
 * content words, matched against the tab's host, URL, and title. Anything
 * ambiguous is `unknown`, never `unrelated`: blank/internal pages, search
 * engines (a waypoint, not a destination), and goals too vague to judge.
 */

export interface GoalWorkspace {
  name: string
  goal: string
}

export interface GoalTab {
  url: string
  title?: string
}

export type GoalDriftVerdict = 'related' | 'unrelated' | 'unknown'

export interface GoalDriftAssessment {
  verdict: GoalDriftVerdict
  /** Sites named in the goal, e.g. `arxiv.org` (empty when none are named). */
  hosts: string[]
  /** Content words from the workspace name + goal used for matching. */
  keywords: string[]
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from', 'get', 'goal', 'handle',
  'in', 'include', 'includes', 'into', 'is', 'it', 'my', 'of', 'on', 'or', 'our', 'per', 'sites',
  'the', 'their', 'this', 'to', 'use', 'using', 'want', 'what', 'when', 'with', 'workspaces',
  'workspace', 'your', 'everyday', 'things', 'stuff', 'done', 'keep', 'make', 'help'
])

const SEARCH_HOSTS = ['google.', 'bing.com', 'duckduckgo.com', 'search.brave.com', 'kagi.com', 'startpage.com', 'ecosia.org', 'yahoo.']

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))

/** Domain-looking tokens in the goal, e.g. `arxiv.org` in "sites include arxiv.org". */
export function goalHosts(goal: string): string[] {
  const found = goal.toLowerCase().match(/\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|ai|co|edu|gov|app|me|tv|so|uk|de|fr|jp|au|ca)\b/g) ?? []
  return [...new Set(found.map((h) => h.replace(/^www\./, '')))]
}

const hostOf = (url: string): string => {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export function assessTabAgainstGoal(workspace: GoalWorkspace, tab: GoalTab): GoalDriftAssessment {
  const hosts = goalHosts(workspace.goal)
  const goalKeywords = wordsOf(workspace.goal)
  const keywords = [...new Set([...wordsOf(workspace.name), ...goalKeywords].filter((w) => !hosts.some((h) => h.split('.').includes(w))))]

  const host = hostOf(tab.url)
  if (!tab.url.trim() || !host || /^(about|chrome|magic|data|blob|file):/.test(tab.url.toLowerCase())) {
    return { verdict: 'unknown', hosts, keywords }
  }
  if (SEARCH_HOSTS.some((s) => host === s.replace(/\.$/, '') || host.startsWith(s) || host.endsWith(`.${s.replace(/\.$/, '')}`))) {
    return { verdict: 'unknown', hosts, keywords }
  }
  // A site the goal names (or a subdomain of one) is related by definition.
  if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return { verdict: 'related', hosts, keywords }

  const haystack = new Set(wordsOf(`${host} ${tab.url} ${tab.title ?? ''}`))
  // Exact token match, plus a crude stem match (project ~ projects).
  const matches = (k: string) =>
    haystack.has(k) || [...haystack].some((t) => t.length >= 4 && k.length >= 4 && (t.startsWith(k) || k.startsWith(t)))
  if (keywords.some(matches)) return { verdict: 'related', hosts, keywords }

  // Only call it unrelated when the goal itself gives enough to judge by:
  // named sites, or at least two goal content words with zero overlap. (The
  // workspace name may add matching words, but alone it proves nothing.)
  return hosts.length > 0 || goalKeywords.length >= 2
    ? { verdict: 'unrelated', hosts, keywords }
    : { verdict: 'unknown', hosts, keywords }
}

/**
 * Counts consecutive unrelated tab navigations in one workspace. `unknown`
 * navigations neither advance nor reset the streak; a related one resets it.
 * Each tab+URL is judged once, so snapshot re-renders and title updates
 * never double-count. `prime` marks already-open tabs as seen without
 * judging them (tabs restored on switch/launch are not user drift).
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
