import { buildCompleteOnboardingInput, type OnboardingData } from '../../../core/onboarding'
import type { CompletedOnboarding } from '@shared/onboarding'
import { onboardingPersistence } from '@/engine/onboarding-persistence'

/**
 * End of onboarding: save the collected answers to SQLite as the user
 * profile + initial settings (via preload IPC; in-memory fallback in a
 * plain browser tab). Wire it as the flow's save handler:
 *
 *   OnboardingFlow.create(steps, { onSave: completeOnboarding })
 *
 * The flow calls it exactly once on finish, so a double-clicked Save
 * cannot write twice; a failed save surfaces as the flow's save-error.
 */
export async function completeOnboarding(data: Readonly<OnboardingData>): Promise<CompletedOnboarding> {
  return onboardingPersistence.completeOnboarding(buildCompleteOnboardingInput(data))
}

/** Stored profile + settings, or null when onboarding never completed. */
export async function loadOnboarding(): Promise<CompletedOnboarding | null> {
  return onboardingPersistence.loadOnboarding()
}
