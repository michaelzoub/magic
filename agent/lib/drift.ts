import type { DriftAssessmentRequest, DriftTabVerdict, GoalDriftVerdict } from '@shared/agent'

/**
 * Goal-drift plumbing between the model and the app.
 *
 * The model — not a heuristic — decides whether a tab the user opened is
 * unrelated to the active workspace's goal, in a single bare inference
 * call (see `agent/lib/inference.ts`): no agent loop, no thinking. It
 * answers with one machine-readable line:
 *
 *   DRIFT_VERDICT: {"verdicts":[{"tabId":"t1","verdict":"unrelated","reason":"short reason"}]}
 *
 * The host extracts the verdicts. A missing/unparseable reply means the
 * model did not judge: every tab stays `unknown`, and `unknown` never
 * triggers the drift warning.
 */

export const DRIFT_VERDICT_MARKER = 'DRIFT_VERDICT:'

const VERDICTS: readonly GoalDriftVerdict[] = ['related', 'unrelated', 'unknown']

export function buildDriftPrompt(request: DriftAssessmentRequest): string {
  const { workspace, tabs } = request
  return [
    `Workspace "${workspace.name}", goal: ${workspace.goal.trim() || '(none)'}`,
    'Tabs:',
    ...tabs.map((t) => `- [${t.id}] ${t.title.trim() || '(untitled)'} — ${t.url}`),
    'Classify each tab: "related" = plausibly serves the goal; "unrelated" = clearly a different topic/task (only when confident); "unknown" = too vague to judge, or a search/blank page. When in doubt, "unknown".',
    `Reply with only: ${DRIFT_VERDICT_MARKER} {"verdicts":[{"tabId":"<id>","verdict":"related|unrelated|unknown","reason":"<3-5 words>"}]}`
  ].join('\n')
}

/** Extract the model's per-tab drift verdicts from a reply. Unjudged tabs are absent. */
export function extractDriftVerdicts(reply: string | null, tabIds: readonly string[]): DriftTabVerdict[] {
  if (!reply) return []
  const line = reply.split('\n').find((l) => l.trimStart().startsWith(DRIFT_VERDICT_MARKER))
  // Accept the marker line, or a bare JSON reply (a terse model may skip the marker).
  const json = line ? line.slice(line.indexOf(DRIFT_VERDICT_MARKER) + DRIFT_VERDICT_MARKER.length).trim() : reply.trim()
  if (!json.startsWith('{')) return []
  let parsed: { verdicts?: unknown }
  try {
    parsed = JSON.parse(json) as { verdicts?: unknown }
  } catch {
    return []
  }
  if (!Array.isArray(parsed.verdicts)) return []
  const wanted = new Set(tabIds)
  const verdicts: DriftTabVerdict[] = []
  for (const entry of parsed.verdicts) {
    const e = entry as { tabId?: unknown; verdict?: unknown; reason?: unknown }
    if (typeof e.tabId !== 'string' || !wanted.has(e.tabId)) continue
    if (typeof e.verdict !== 'string' || !VERDICTS.includes(e.verdict as GoalDriftVerdict)) continue
    if (verdicts.some((v) => v.tabId === e.tabId)) continue
    verdicts.push({ tabId: e.tabId, verdict: e.verdict as GoalDriftVerdict, reason: typeof e.reason === 'string' ? e.reason : null })
  }
  return verdicts
}
