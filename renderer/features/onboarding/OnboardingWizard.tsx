import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { OnboardingStep } from '@core/onboarding'
import type { OnboardingData, OnboardingFlow } from '@core/onboarding'
import { Dialog } from '@/components/ui'

/** Props every custom step UI receives. */
export interface OnboardingStepProps<TValue = unknown> {
  value: TValue | undefined
  setValue(value: TValue): void
  /** All answers collected so far, keyed by step id. */
  data: Readonly<OnboardingData>
  flow: OnboardingFlow
}

export type OnboardingStepComponent<TValue = unknown> = ComponentType<OnboardingStepProps<TValue>>

/** Create a step whose custom UI is a renderer component. */
export function uiStep<TValue>(definition: {
  id: string
  title?: string
  ui: OnboardingStepComponent<TValue>
  initialValue?: TValue | ((data: Readonly<OnboardingData>) => TValue)
  validate?: OnboardingStep<TValue>['validate']
  isEnabled?: (data: Readonly<OnboardingData>) => boolean
}): OnboardingStep<TValue, OnboardingStepComponent<TValue>> {
  return new OnboardingStep<TValue, OnboardingStepComponent<TValue>>(definition)
}

const btn =
  'no-drag h-8 rounded-[6px] px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'

/**
 * Renders an {@link OnboardingFlow}: the current step's custom UI, a
 * "Step X of N" progress bar (N = flow.totalSteps), Back/Next navigation,
 * and a final Save that calls the flow's injected `onSave` once.
 */
export function OnboardingWizard({ flow, open, onClose, onComplete, title = 'Welcome' }: {
  flow: OnboardingFlow
  open: boolean
  onClose(): void
  onComplete?(data: Readonly<OnboardingData>): void
  title?: string
}) {
  const [, rerender] = useState(0)
  useEffect(() => flow.subscribe(() => rerender((n) => n + 1)), [flow])

  const step = flow.currentStep
  const StepUI = step?.ui as OnboardingStepComponent | undefined
  const { current, total, fraction } = flow.progress
  const saving = flow.status === 'saving'

  const advance = async () => {
    const wasLast = flow.isLast
    if (await flow.next()) {
      if (wasLast) {
        onComplete?.(flow.collectedData)
        onClose()
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} label={title} hideHeader>
      <div className="px-4 pb-2 pt-4">
        <div className="flex items-center justify-between text-[11px] text-white/40">
          <span>{step?.title ?? ''}</span>
          <span>Step {current} of {total}</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-white/70 transition-all" style={{ width: `${fraction * 100}%` }} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {step && StepUI ? (
          <StepUI
            key={step.id}
            value={flow.value(step.id)}
            setValue={(v) => flow.setValue(step.id, v)}
            data={flow.collectedData}
            flow={flow}
          />
        ) : (
          <p className="text-[12px] text-white/50">This step has no UI.</p>
        )}
      </div>

      {flow.error && (
        <p role="alert" className="px-4 pb-1 text-[12px] text-red-300">{flow.error}</p>
      )}

      <footer className="flex items-center gap-2 px-4 pb-4 pt-2">
        <span className="flex-1" />
        {flow.isFirst ? (
          <button type="button" disabled={saving} onClick={onClose} className={`${btn} border border-white/15 text-white/80 hover:bg-white/[0.08] hover:text-white`}>
            Cancel
          </button>
        ) : (
          <button type="button" disabled={saving} onClick={() => flow.back()} className={`${btn} bg-white/[0.08] text-white hover:bg-white/[0.14]`}>
            Back
          </button>
        )}
        <button type="button" disabled={saving} onClick={() => void advance()} className={`${btn} bg-white text-black hover:bg-white/85`}>
          {saving ? 'Saving…' : flow.isLast ? 'Save' : 'Continue →'}
        </button>
      </footer>
    </Dialog>
  )
}
