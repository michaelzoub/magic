import type { OnboardingData, OnboardingStepDefinition, OnboardingValidator } from './types'

/**
 * One onboarding step. Create one object per step — an {@link OnboardingFlow}
 * counts these objects to derive its total step count, renders `ui` for the
 * current one, and saves each step's answer under its `id`.
 *
 * Subclass it or instantiate it directly; both work:
 *   class NameStep extends OnboardingStep<string>
 *   new OnboardingStep({ id: 'name', ui: NameStepUI, validate: fn })
 */
export class OnboardingStep<TValue = unknown, TUi = unknown> {
  readonly id: string
  readonly title?: string
  readonly ui?: TUi
  readonly validate?: OnboardingValidator<TValue>
  private readonly initialValue?: OnboardingStepDefinition<TValue, TUi>['initialValue']
  private readonly enabledWhen?: (data: Readonly<OnboardingData>) => boolean

  constructor(definition: OnboardingStepDefinition<TValue, TUi>) {
    if (!definition.id.trim()) throw new Error('Onboarding step id is required')
    this.id = definition.id
    this.title = definition.title
    this.ui = definition.ui
    this.validate = definition.validate
    this.initialValue = definition.initialValue
    this.enabledWhen = definition.isEnabled
  }

  isEnabled(data: Readonly<OnboardingData>): boolean {
    return this.enabledWhen?.(data) ?? true
  }

  initial(data: Readonly<OnboardingData>): TValue | undefined {
    return typeof this.initialValue === 'function'
      ? (this.initialValue as (data: Readonly<OnboardingData>) => TValue)(data)
      : this.initialValue
  }
}
