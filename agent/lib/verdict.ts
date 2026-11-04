import type { CheckpointVerdict } from '@shared/agent'

/**
 * Checkpoint-verdict plumbing between the agent and the app.
 *
 * The agent — not a heuristic — decides whether a moment is a meaningful
 * checkpoint worth showing in Memory. It communicates that judgment by
 * ending its final reply with one machine-readable line:
 *
 *   CHECKPOINT_VERDICT: {"meaningful":true,"reason":"short reason"}
 *
 * The host extracts the verdict and strips the line, so users only ever
 * see the human-readable summary. A missing/unparseable line means the
 * agent did not judge the moment: the checkpoint stays saved but hidden.
 */

export const CHECKPOINT_VERDICT_MARKER = 'CHECKPOINT_VERDICT:'

/** Prompt instructions asking the agent to judge its moment as a checkpoint. */
export function checkpointVerdictInstruction(context: 'switch' | 'chat'): string {
  const meaningful =
    context === 'switch'
      ? [
          'a genuine change of context: switching workspaces and leaving behind a coherent set of tabs the user may want to resume later',
          'you propose opening a set of tabs (several related tabs) to set up the new workspace for its goal',
          'substantive work was in progress in the tabs being left behind'
        ]
      : [
          'the user asked a question in the Magic chat and the turn produced work worth returning to — e.g. you opened a set of tabs, gathered research, or set up a task context',
          'the conversation created a tab set the user is likely to resume or build on later'
        ]
  const notMeaningful =
    context === 'switch'
      ? [
          'an accidental, empty, or bounce switch (there and straight back) with nothing of substance left behind',
          'only blank/new-tab pages were open, or the same tabs remain open afterwards'
        ]
      : ['a simple question you answered from knowledge with no browser work and no tab set worth returning to', 'a failed or trivial turn']
  return [
    'Checkpoint judgment: a checkpoint of this moment has been saved, but it is only shown to the user in Memory if you judge it meaningful. Judge based on what actually happened in this run. Meaningful:',
    ...meaningful.map((m) => `- ${m}`),
    'Not meaningful:',
    ...notMeaningful.map((m) => `- ${m}`),
    `End your reply with exactly one final line (after your summary, no markdown): ${CHECKPOINT_VERDICT_MARKER} {"meaningful":true,"reason":"one short reason"} — or "meaningful":false with the reason it is not worth showing.`
  ].join('\n')
}

/** Extract the agent's verdict from a reply, returning the reply with the verdict line removed. */
export function extractCheckpointVerdict(reply: string | null): { reply: string | null; verdict: CheckpointVerdict | null } {
  if (!reply) return { reply, verdict: null }
  const lines = reply.split('\n')
  const idx = lines.findIndex((l) => l.trimStart().startsWith(CHECKPOINT_VERDICT_MARKER))
  if (idx === -1) return { reply, verdict: null }
  let verdict: CheckpointVerdict | null = null
  try {
    const parsed = JSON.parse(lines[idx].slice(lines[idx].indexOf(CHECKPOINT_VERDICT_MARKER) + CHECKPOINT_VERDICT_MARKER.length).trim()) as {
      meaningful?: unknown
      reason?: unknown
    }
    if (typeof parsed.meaningful === 'boolean') {
      verdict = { meaningful: parsed.meaningful, reason: typeof parsed.reason === 'string' ? parsed.reason : null }
    }
  } catch {
    // Unparseable verdict line: treated as no judgment, still stripped below.
  }
  const cleaned = lines.filter((_, i) => i !== idx).join('\n').trim()
  return { reply: cleaned || null, verdict }
}
