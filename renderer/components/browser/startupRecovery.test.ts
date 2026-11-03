import { describe, expect, it } from 'vitest'
import { shouldShowStartupRecovery } from './startupRecovery'

describe('shouldShowStartupRecovery', () => {
  it('fresh app open with no tabs → dialog shows', () => {
    expect(shouldShowStartupRecovery({ atStartup: true, hasOpenTabs: false, hasCheckpoint: true })).toBe(true)
  })

  it('fresh app open with existing tabs → dialog does not show', () => {
    expect(shouldShowStartupRecovery({ atStartup: true, hasOpenTabs: true, hasCheckpoint: true })).toBe(false)
  })

  it('workspace switch during an active session → dialog does not show', () => {
    // Even landing on an empty workspace (no open tabs) after a switch must
    // not re-arm the prompt: it is a startup recovery surface, not a
    // blank-tab modal.
    expect(shouldShowStartupRecovery({ atStartup: false, hasOpenTabs: false, hasCheckpoint: true })).toBe(false)
  })

  it('fresh app open with nothing to recover → dialog does not show', () => {
    expect(shouldShowStartupRecovery({ atStartup: true, hasOpenTabs: false, hasCheckpoint: false })).toBe(false)
  })
})
