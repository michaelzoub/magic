/**
 * Onboarding data models. Pure data — no Electron or UI dependencies.
 * The UI payload of a step is opaque (`TUi`) so the core never imports
 * a component library; the renderer narrows it to its component type.
 */

/** Collected answers, keyed by step id. One entry per answered step. */
export type OnboardingData = Record<string, unknown>

export type OnboardingStatus = 'in-progress' | 'saving' | 'completed' | 'save-error'

/** Return an error message to block progress, or null/undefined to pass. */
export type OnboardingValidator<TValue> = (
  value: TValue | undefined,
  data: Readonly<OnboardingData>
) => string | null | undefined | Promise<string | null | undefined>

export interface OnboardingStepDefinition<TValue = unknown, TUi = unknown> {
  /** Unique within a flow. Also the key its answer is saved under. */
  id: string
  title?: string
  /** Custom UI for this step, interpreted by the renderer (opaque here). */
  ui?: TUi
  /** Seed value, or a factory receiving the data collected so far. */
  initialValue?: TValue | ((data: Readonly<OnboardingData>) => TValue)
  validate?: OnboardingValidator<TValue>
  /** Conditional steps: disabled steps are skipped and excluded from the total. */
  isEnabled?: (data: Readonly<OnboardingData>) => boolean
}

/** Called exactly once per successful finish, with every collected answer. */
export type OnboardingSaveHandler = (data: Readonly<OnboardingData>) => unknown

export interface OnboardingProgress {
  /** 1-based position within the enabled steps; 0 when there are none. */
  current: number
  total: number
  /** 0..1, for progress bars. 1 when there are no steps. */
  fraction: number
}
