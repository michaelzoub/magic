/**
 * Onboarding persistence contract (SQLite in the main process).
 *
 * The renderer never touches the database directly: completing onboarding
 * funnels through `completeOnboarding` over IPC (see preload), which writes
 * the user profile and the initial settings atomically. There is exactly
 * one profile per installation (singleton row); re-running onboarding
 * updates it in place.
 */

export type SettingValue = string | number | boolean | null | SettingValue[] | { [key: string]: SettingValue }

/** Initial app settings seeded from the onboarding answers, keyed by setting name. */
export type InitialSettings = Record<string, SettingValue>

export interface UserProfile {
  /** Display name collected during onboarding. */
  displayName: string
  /** Primary goal collected during onboarding ('' when not asked). */
  goal: string
  /** When onboarding was first completed; null before that. */
  onboardingCompletedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface CompleteOnboardingInput {
  profile: {
    displayName: string
    goal: string
  }
  /** Seeded only on first completion for keys that have no value yet. */
  settings: InitialSettings
  /** Injectable for tests; defaults to now in the store. */
  completedAt?: number
}

export interface CompletedOnboarding {
  profile: UserProfile
  settings: InitialSettings
}

export interface OnboardingPersistence {
  /** Save the user profile + initial settings atomically; returns what was stored. */
  completeOnboarding(input: CompleteOnboardingInput): Promise<CompletedOnboarding>
  /** Stored profile + settings, or null when onboarding never completed. */
  loadOnboarding(): Promise<CompletedOnboarding | null>
}

export const ONBOARDING_IPC = {
  complete: 'onboarding:complete',
  load: 'onboarding:load'
} as const
