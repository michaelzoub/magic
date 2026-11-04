/**
 * Chat prompt construction. Pure and runtime-agnostic: the same message
 * the Electron host sends to Eve today can be handed to any future
 * `AgentRuntime` unchanged.
 */
import type { AgentChatContext } from '@shared/agent'
import { checkpointVerdictInstruction } from './verdict'

const MAX_TABS_LISTED = 20

export function buildAgentChatPrompt(question: string, context: AgentChatContext): string {
  const workspace = context.workspace
  const lines = [
    'The user is asking you a question from the Magic chatbox. Answer it, using your browser tools (list/open/switch tabs, navigate, read page content, query/click/type) whenever the task needs the browser — do not guess at page contents.',
    'Never ask the user a question — no clarifying, confirmation, or follow-up questions, including ending with "Want me to…?". Just execute: make the most reasonable assumption and do the task. If what the user refers to is not in the open tabs, search for it and open relevant tabs yourself instead of asking whether to.',
    '',
    workspace
      ? `Active workspace: "${workspace.name}" (id: ${workspace.id})\nGoal: ${workspace.goal.trim() || '(no goal set)'}`
      : 'Active workspace: (none)'
  ]
  if (context.tabs.length === 0) {
    lines.push('Tabs open in the active workspace: (none)')
  } else {
    const tabs = context.tabs.slice(0, MAX_TABS_LISTED).map((t) => `- ${t.title.trim() || '(untitled)'} — ${t.url}`)
    if (context.tabs.length > MAX_TABS_LISTED) tabs.push(`- …and ${context.tabs.length - MAX_TABS_LISTED} more`)
    lines.push(`Tabs open in the active workspace:\n${tabs.join('\n')}`)
  }
  lines.push(
    '',
    'Verify live state with `list_tabs` before acting; the list above is a snapshot.',
    '',
    checkpointVerdictInstruction('chat'),
    '',
    `User question: ${question.trim()}`
  )
  return lines.join('\n')
}
