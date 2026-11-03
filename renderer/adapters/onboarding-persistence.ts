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
          // First identity wins, mirroring the SQLite store.
          identitySeed: stored?.profile.identitySeed ?? input.profile.identitySeed ?? null,
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
    },
    async updateProfile(input) {
      if (!stored) throw new Error('No profile to update')
      const displayName = input.displayName.trim()
      if (!displayName) throw new Error('Profile display name is required')
      stored = {
        profile: { ...stored.profile, displayName, updatedAt: Date.now() },
        settings: { ...stored.settings, description: input.description.trim() }
      }
      return structuredClone(stored)
    }
  }
}

/** SQLite-backed persistence inside the shell; in-memory fallback in a browser tab. */
export const onboardingPersistence: OnboardingPersistence = window.onboarding ?? createMemoryPersistence()
