/**
 * Startup-recovery gate for the recent-switch prompt.
 *
 * The prompt is a *startup recovery* surface, not a general blank-tab
 * modal: it may only be offered at a fresh app open, before the session
 * is underway, and only when nothing is already open to continue with.
 * This is a pure function of three facts so the decision is deterministic
 * and unit-testable; `App` latches it once (when workspaces have
 * rehydrated) and never re-arms it for the rest of the session — in
 * particular, workspace switches during an active session pass
 * `atStartup: false` forever after.
 */
export interface StartupRecoveryInput {
  /** True only for the one evaluation made at fresh app open. */
  atStartup: boolean
  /** Any real (non-blank) tabs already open or restored at that moment. */
  hasOpenTabs: boolean
  /** A recent switch (Memory checkpoint) exists to offer recovery from. */
  hasCheckpoint: boolean
}

export function shouldShowStartupRecovery(input: StartupRecoveryInput): boolean {
  return input.atStartup && !input.hasOpenTabs && input.hasCheckpoint
}
