import type { EmbeddedAgent } from '@shared/agent'

declare global {
  interface Window {
    agent?: EmbeddedAgent
  }
}

/**
 * Embedded-agent surface. In a plain browser tab (no preload) switches
 * are reported as skipped; the agent only runs inside the Electron shell.
 */
export const embeddedAgent: EmbeddedAgent = window.agent ?? {
  async workspaceSwitched() {
    return { status: 'skipped', reply: null, reason: 'Agent is only available in the Electron shell' }
  }
}
