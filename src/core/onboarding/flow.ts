import { OnboardingStep } from './step'
import type { OnboardingData, OnboardingProgress, OnboardingSaveHandler, OnboardingStatus } from './types'

export interface OnboardingFlowOptions {
  /** Saves all collected data at the end. Injected — localStorage, IPC, HTTP… */
  onSave: OnboardingSaveHandler
  initialData?: OnboardingData
}

/**
 * Factory + state machine for an onboarding flow.
 *
 * Extensibility model: build steps as {@link OnboardingStep} objects (each
 * with its own custom `ui`, validator, and optional `isEnabled` condition),
 * hand them to this class, and it derives everything else — `totalSteps`
 * is the count of enabled step objects, navigation skips disabled steps,
 * and `finish()` saves the accumulated data exactly once.
 *
 *   const flow = OnboardingFlow.create([new NameStep(), new GoalStep()], {
 *     onSave: async (data) => api.saveOnboarding(data)
 *   })
 */
export class OnboardingFlow {
  private readonly steps: readonly OnboardingStep<any, any>[]
  private readonly onSave: OnboardingSaveHandler
  private readonly listeners = new Set<() => void>()
  private data: OnboardingData
  private index = 0
  private finishing: Promise<boolean> | null = null

  status: OnboardingStatus = 'in-progress'
  /** Last validation or save error, cleared on the next successful action. */
  error: string | null = null

  private constructor(steps: readonly OnboardingStep<any, any>[], options: OnboardingFlowOptions) {
    if (steps.length === 0) throw new Error('Onboarding requires at least one step')
    const seen = new Set<string>()
    for (const step of steps) {
      if (!(step instanceof OnboardingStep)) throw new Error('Onboarding steps must be OnboardingStep objects')
      if (seen.has(step.id)) throw new Error(`Duplicate onboarding step id "${step.id}"`)
      seen.add(step.id)
    }
    this.steps = steps
    this.onSave = options.onSave
    this.data = { ...options.initialData }
    for (const step of steps) {
      if (!(step.id in this.data)) {
        const initial = step.initial(this.data)
        if (initial !== undefined) this.data[step.id] = initial
      }
    }
  }

  static create(steps: readonly OnboardingStep<any, any>[], options: OnboardingFlowOptions): OnboardingFlow {
    return new OnboardingFlow(steps, options)
  }

  // -- Derived counts -------------------------------------------------------

  /** Every registered step object, enabled or not. */
  get registeredSteps(): number {
    return this.steps.length
  }

  /** Steps currently enabled — the denominator of "Step X of N". */
  get totalSteps(): number {
    return this.enabledSteps.length
  }

  get enabledSteps(): readonly OnboardingStep<any, any>[] {
    return this.steps.filter((s) => s.isEnabled(this.data))
  }

  get currentStep(): OnboardingStep<any, any> | null {
    return this.enabledSteps[this.index] ?? null
  }

  /** 0-based position within the enabled steps. */
  get currentIndex(): number {
    return this.index
  }

  get isFirst(): boolean {
    return this.index <= 0
  }

  get isLast(): boolean {
    return this.index >= this.totalSteps - 1
  }

  get progress(): OnboardingProgress {
    const total = this.totalSteps
    return { current: total === 0 ? 0 : this.index + 1, total, fraction: total === 0 ? 1 : (this.index + 1) / total }
  }

  /** Snapshot copy — mutating it does not affect the flow. */
  get collectedData(): Readonly<OnboardingData> {
    return { ...this.data }
  }

  // -- Data -----------------------------------------------------------------

  value<TValue>(stepId: string): TValue | undefined {
    return this.data[stepId] as TValue | undefined
  }

  setValue(stepId: string, value: unknown): void {
    if (!this.steps.some((s) => s.id === stepId)) throw new Error(`Unknown onboarding step "${stepId}"`)
    this.data = { ...this.data, [stepId]: value }
    this.error = null
    this.clampIndex()
    this.emit()
  }

  // -- Navigation -------------------------------------------------------------

  /** Validate the current step, then advance. On the last step, finishes. */
  async next(): Promise<boolean> {
    if (this.isLast) return this.finish()
    const step = this.currentStep
    if (!step || !(await this.validateStep(step))) return false
    this.index += 1
    this.emit()
    return true
  }

  back(): boolean {
    if (this.isFirst) return false
    this.index -= 1
    this.error = null
    this.emit()
    return true
  }

  /** Jump to an enabled step by id (e.g. from a summary/edit screen). */
  goToStep(stepId: string): boolean {
    const target = this.enabledSteps.findIndex((s) => s.id === stepId)
    if (target < 0) return false
    this.index = target
    this.error = null
    this.emit()
    return true
  }

  // -- Completion -----------------------------------------------------------

  /**
   * Validate every enabled step (jumping to the first invalid one), then
   * call `onSave` once with all collected data. Concurrent calls share one
   * in-flight save; after success, further calls are no-ops. A failed save
   * sets `status: 'save-error'` and can be retried.
   */
  async finish(): Promise<boolean> {
    if (this.status === 'completed') return true
    // Set synchronously, before any await: concurrent finish() calls
    // (double-clicked Save) share this one attempt instead of saving twice.
    if (this.finishing) return this.finishing
    this.finishing = this.doFinish()
    try {
      return await this.finishing
    } finally {
      this.finishing = null
    }
  }

  private async doFinish(): Promise<boolean> {
    for (const step of this.enabledSteps) {
      if (!(await this.validateStep(step))) {
        this.goToStep(step.id)
        return false
      }
    }
    this.status = 'saving'
    this.error = null
    this.emit()
    try {
      await this.onSave(this.collectedData)
      this.status = 'completed'
      return true
    } catch (err) {
      this.status = 'save-error'
      this.error = err instanceof Error ? err.message : 'Failed to save onboarding data'
      return false
    } finally {
      this.emit()
    }
  }

  reset(initialData: OnboardingData = {}): void {
    this.data = { ...initialData }
    for (const step of this.steps) {
      if (!(step.id in this.data)) {
        const initial = step.initial(this.data)
        if (initial !== undefined) this.data[step.id] = initial
      }
    }
    this.index = 0
    this.status = 'in-progress'
    this.error = null
    this.emit()
  }

  // -- Reactivity (for renderer bindings) ------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async validateStep(step: OnboardingStep<any, any>): Promise<boolean> {
    const message = await step.validate?.(this.data[step.id], this.data)
    this.error = message ?? null
    this.emit()
    return !message
  }

  /** Keep `index` valid when `isEnabled` conditions change with the data. */
  private clampIndex(): void {
    this.index = Math.min(this.index, Math.max(this.totalSteps - 1, 0))
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
