import type { CompletedOnboarding, OnboardingPersistence } from '@shared/onboarding'

declare global {
  interface Window {
    onboarding?: OnboardingPersistence
  }
}

/** In-memory fallback for plain-browser UI work (no Electron preload). Same contract, nothing survives reload. */
function createMemoryPersistence(): OnboardingPersistence {
  let stored: CompletedOnboarding | null = null
  return {
    async completeOnboarding(input) {
      const now = input.completedAt ?? Date.now()
      stored = {
        profile: {
          displayName: input.profile.displayName.trim(),
          goal: input.profile.goal ?? '',
          onboardingCompletedAt: stored?.profile.onboardingCompletedAt ?? now,
          createdAt: stored?.profile.createdAt ?? now,
          updatedAt: now
        },
        // Seed-only semantics, mirroring the SQLite store.
        settings: { ...structuredClone(input.settings), ...stored?.settings }
      }
      return structuredClone(stored)
    },
    async loadOnboarding() {
      return stored ? structuredClone(stored) : null
    }
  }
}

/** SQLite-backed persistence inside the shell; in-memory fallback in a browser tab. */
export const onboardingPersistence: OnboardingPersistence = window.onboarding ?? createMemoryPersistence()
