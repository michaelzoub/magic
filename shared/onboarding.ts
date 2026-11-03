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
  /**
   * Procedural identity seed (see core/identity), generated deterministically
   * from the onboarding choices at first completion and then preserved —
   * re-running onboarding never mints a new identity. Null only for rows
   * that predate the column and have not been loaded/backfilled yet.
   */
  identitySeed: string | null
  /** When onboarding was first completed; null before that. */
  onboardingCompletedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface CompleteOnboardingInput {
  profile: {
    displayName: string
    goal: string
    /** Identity seed derived from the answers; first persisted value wins. */
    identitySeed?: string
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

/** Editable local-profile fields. Everything else on the profile is preserved. */
export interface UpdateProfileInput {
  displayName: string
  /** The one-sentence description shown under the name (stored as the `description` setting). */
  description: string
}

export interface OnboardingPersistence {
  /** Save the user profile + initial settings atomically; returns what was stored. */
  completeOnboarding(input: CompleteOnboardingInput): Promise<CompletedOnboarding>
  /** Stored profile + settings, or null when onboarding never completed. */
  loadOnboarding(): Promise<CompletedOnboarding | null>
  /**
   * Update the existing singleton profile in place (display name +
   * description only); returns what was stored. The identity seed and all
   * other profile fields, settings, and onboarding data are preserved.
   */
  updateProfile(input: UpdateProfileInput): Promise<CompletedOnboarding>
}

export const ONBOARDING_IPC = {
  complete: 'onboarding:complete',
  load: 'onboarding:load',
  updateProfile: 'onboarding:update-profile'
} as const
