import type { AgentStreamEvent, AgentTabProposal } from '@shared/agent'

const hostOf = (url: string): string => {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '') || url
  } catch {
    return url
  }
}

const inputRecord = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' ? (input as Record<string, unknown>) : {}

/**
 * Fold one live stream event into a short, user-facing trace line, or null
 * when it is not an important part (reply text streams, read-only lookups
 * that teach the user nothing, successful tool settlements already covered
 * by their call line).
 */
export function describeAgentEvent(event: AgentStreamEvent): string | null {
  if (event.type === 'tool-result') {
    return event.outcome === 'completed' ? null : `${(event.name ?? 'Tool').replace(/_/g, ' ')} failed${event.error ? `: ${event.error}` : ''}`
  }
  if (event.type !== 'tool-call') return null
  const input = inputRecord(event.input)
  switch (event.name) {
    case 'list_tabs':
    case 'get_active_tab':
      return 'Checking open tabs'
    case 'open_tab':
      return input.url ? `Proposing to open ${hostOf(String(input.url))}` : 'Proposing to open a new tab'
    case 'close_tab':
      return 'Proposing to close a tab'
    case 'navigate':
      return input.url ? `Proposing to open ${hostOf(String(input.url))} in a tab` : null
    case 'switch_tab':
      return null
    case 'get_page_content':
    case 'query_elements':
      return 'Reading a page'
    default:
      return null
  }
}

export function describeProposal(p: AgentTabProposal): string {
  switch (p.kind) {
    case 'open':
      return p.url ? `Open ${hostOf(p.url)}` : 'Open a new tab'
    case 'close':
      return `Close ${p.title || hostOf(p.url) || 'a tab'}`
    case 'navigate':
      return `Open ${hostOf(p.url)} in ${p.title || 'a tab'}`
  }
}

/** Title + supporting detail for one proposal row in the grouped layout. */
export function describeProposalDetail(p: AgentTabProposal): { title: string; detail: string } {
  switch (p.kind) {
    case 'open':
      return p.url ? { title: hostOf(p.url), detail: p.url } : { title: 'New tab', detail: 'Blank tab' }
    case 'close':
      return { title: p.title || hostOf(p.url) || 'Tab', detail: p.url }
    case 'navigate':
      return { title: hostOf(p.url), detail: `In ${p.title || 'existing tab'}` }
  }
}

export interface ProposalGroup {
  kind: AgentTabProposal['kind']
  label: string
  proposals: AgentTabProposal[]
}

const GROUP_LABELS: Record<AgentTabProposal['kind'], string> = {
  open: 'Open',
  navigate: 'Open in existing tab',
  close: 'Close'
}
const GROUP_ORDER: AgentTabProposal['kind'][] = ['open', 'navigate', 'close']

/** Group proposals by action kind (opens first, closes last); empty groups are omitted. */
export function groupProposals(proposals: readonly AgentTabProposal[]): ProposalGroup[] {
  return GROUP_ORDER.flatMap((kind) => {
    const group = proposals.filter((p) => p.kind === kind)
    return group.length > 0 ? [{ kind, label: GROUP_LABELS[kind], proposals: group }] : []
  })
}
