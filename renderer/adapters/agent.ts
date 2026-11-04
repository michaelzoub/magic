import { DEFAULT_ASSISTANCE, type AssistanceSettings, type EmbeddedAgent } from '@shared/agent'

declare global {
  interface Window {
    agent?: EmbeddedAgent
  }
}

/**
 * Embedded-agent surface. In a plain browser tab (no preload) switches
 * are reported as skipped; the agent only runs inside the Electron shell.
 *
 * Each method resolves `window.agent` at call time and falls back per
 * method when it (or that method) is missing. The old capture-once shape
 * broke after a renderer reload against a stale preload: the captured
 * bridge had no `ask`, so chat died with "embeddedAgent.ask is not a
 * function" even though the fallback existed.
 */
/** In-memory fallback state, so the toggle/exclusions still work in a plain browser. */
let fallbackAssistance: AssistanceSettings = { ...DEFAULT_ASSISTANCE, excludedSites: [], excludedWorkspaceIds: [] }

const fallback: EmbeddedAgent = {
  async workspaceSwitched() {
    return { status: 'skipped', reply: null, reason: 'Agent is only available in the Electron shell' }
  },
  async ask() {
    return { status: 'skipped', reply: null, reason: 'Agent is only available in the Electron shell' }
  },
  async assessDrift() {
    return { status: 'skipped', verdicts: [], reason: 'Agent is only available in the Electron shell' }
  },
  async getAssistance() {
    return { ...fallbackAssistance, excludedSites: [...fallbackAssistance.excludedSites], excludedWorkspaceIds: [...fallbackAssistance.excludedWorkspaceIds] }
  },
  async setAssistanceActive(active) {
    fallbackAssistance = { ...fallbackAssistance, active }
    return this.getAssistance()
  },
  async setAssistanceExclusions(excludedSites, excludedWorkspaceIds) {
    fallbackAssistance = { ...fallbackAssistance, excludedSites: [...excludedSites], excludedWorkspaceIds: [...excludedWorkspaceIds] }
    return this.getAssistance()
  },
  async listAssistanceActivity() {
    return []
  },
  onTabClosing() {
    return () => {}
  }
}

const bridge = (): Partial<EmbeddedAgent> => (typeof window !== 'undefined' ? (window.agent ?? {}) : {})

export const embeddedAgent: EmbeddedAgent = {
  workspaceSwitched: (notice, onEvent) => {
    const fn = bridge().workspaceSwitched
    return typeof fn === 'function' ? fn(notice, onEvent) : fallback.workspaceSwitched(notice)
  },
  ask: (question, context, onEvent) => {
    const fn = bridge().ask
    return typeof fn === 'function'
      ? fn(question, context, onEvent)
      : Promise.resolve({ status: 'skipped' as const, reply: null, reason: 'Agent bridge is unavailable — restart Magic to reconnect it' })
  },
  assessDrift: (request) => {
    const fn = bridge().assessDrift
    return typeof fn === 'function' ? fn(request) : fallback.assessDrift(request)
  },
  getAssistance: () => {
    const fn = bridge().getAssistance
    return typeof fn === 'function' ? fn() : fallback.getAssistance()
  },
  setAssistanceActive: (active) => {
    const fn = bridge().setAssistanceActive
    return typeof fn === 'function' ? fn(active) : fallback.setAssistanceActive(active)
  },
  setAssistanceExclusions: (excludedSites, excludedWorkspaceIds) => {
    const fn = bridge().setAssistanceExclusions
    return typeof fn === 'function' ? fn(excludedSites, excludedWorkspaceIds) : fallback.setAssistanceExclusions(excludedSites, excludedWorkspaceIds)
  },
  listAssistanceActivity: (limit) => {
    const fn = bridge().listAssistanceActivity
    return typeof fn === 'function' ? fn(limit) : fallback.listAssistanceActivity(limit)
  },
  onTabClosing: (listener) => {
    const fn = bridge().onTabClosing
    return typeof fn === 'function' ? fn(listener) : fallback.onTabClosing(listener)
  }
}
