/**
 * Workspace-switch prompt construction. Pure and runtime-agnostic: the
 * same notice that the Electron host sends to Eve today can be handed to
 * any future `AgentRuntime` unchanged.
 */
import type { AgentTabInfo, WorkspaceSwitchNotice } from '@shared/agent'

const MAX_TABS_LISTED = 20

function workspaceBlock(label: string, w: WorkspaceSwitchNotice['to']): string {
  return `${label}: "${w.name}" (id: ${w.id})\nGoal: ${w.goal.trim() || '(no goal set)'}`
}

function tabList(label: string, tabs: AgentTabInfo[]): string {
  if (tabs.length === 0) return `${label}: (none)`
  const lines = tabs.slice(0, MAX_TABS_LISTED).map((t) => `- ${t.title.trim() || '(untitled)'} — ${t.url}`)
  if (tabs.length > MAX_TABS_LISTED) lines.push(`- …and ${tabs.length - MAX_TABS_LISTED} more`)
  return `${label}:\n${lines.join('\n')}`
}

export function buildWorkspaceSwitchPrompt(notice: WorkspaceSwitchNotice): string {
  return [
    'The user just switched workspaces in the browser. The switch has already happened; the incoming workspace is now active.',
    '',
    notice.from ? workspaceBlock('Previous workspace', notice.from) : 'Previous workspace: (none — first workspace)',
    workspaceBlock('New active workspace', notice.to),
    '',
    tabList('Tabs left behind in the previous workspace', notice.outgoingTabs),
    tabList('Tabs now open in the new workspace', notice.incomingTabs),
    '',
    'Your job: set up the new workspace for its goal, using your browser tools. Be quick and decisive: you are cut off after 15 seconds, so prefer few, high-value actions over exhaustive checks.',
    '- First call `list_tabs` to see the live state; do not trust the lists above over the live state.',
    '- Keep tabs that serve the new workspace goal. Close tabs that clearly do not (blank/new-tab pages, duplicates, leftovers from the previous workspace), and open at most a few tabs that directly help start the goal.',
    '- Do not switch workspaces yourself, and do not undo the user\'s switch.',
    '- If the open tabs already fit the goal, do nothing and say so.',
    'Finish with one short summary of what you changed (opened/closed) and why, or that no changes were needed.'
  ].join('\n')
}
