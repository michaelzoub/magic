import { useEffect, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { OnboardingStep } from '@core/onboarding'
import type { OnboardingData, OnboardingFlow } from '@core/onboarding'
import { Button, Dialog } from '@/components/ui'

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

/**
 * Renders an {@link OnboardingFlow}: the current step's custom UI, a
 * "Step X of N" progress bar (N = flow.totalSteps), Back/Next navigation,
 * and a final Save that calls the flow's injected `onSave` once.
 */
export function OnboardingWizard({ flow, open, onClose, onComplete, title = 'Welcome', renderPreview, renderCompletion }: {
  flow: OnboardingFlow
  open: boolean
  onClose(): void
  onComplete?(data: Readonly<OnboardingData>): void
  title?: string
  /** Live preview (e.g. the assembling identity totem), re-rendered with the collected answers + progress on every flow change. */
  renderPreview?(data: Readonly<OnboardingData>, progress: number): ReactNode
  /** Completion stage shown briefly after a successful save (e.g. the identity reveal) before the wizard closes. */
  renderCompletion?(data: Readonly<OnboardingData>): ReactNode
}) {
  const [, rerender] = useState(0)
  useEffect(() => flow.subscribe(() => rerender((n) => n + 1)), [flow])
  const [revealing, setRevealing] = useState(false)

  const step = flow.currentStep
  const StepUI = step?.ui as OnboardingStepComponent | undefined
  const { current, total, fraction } = flow.progress
  const saving = flow.status === 'saving'

  const finish = () => {
    setRevealing(false)
    onComplete?.(flow.collectedData)
    onClose()
  }

  // Hold the completion stage briefly (the reveal animation), then enter
  // the app. Reduced motion gets a near-instant, static reveal.
  useEffect(() => {
    if (!revealing) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(finish, reduced ? 300 : 1800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealing])

  const advance = async () => {
    const wasLast = flow.isLast
    if (await flow.next()) {
      if (wasLast) {
        if (renderCompletion) setRevealing(true)
        else finish()
      }
    }
  }

  if (revealing && renderCompletion) {
    return (
      <Dialog open={open} onClose={finish} label={title} hideHeader>
        {renderCompletion(flow.collectedData)}
        <footer className="flex items-center justify-center px-4 pb-4">
          <Button variant="primary" onClick={finish}>
            Enter Magic
          </Button>
        </footer>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} label={title} hideHeader>
      <div className="px-4 pb-2 pt-4">
        <div className="flex items-center justify-between text-2xs text-white/40">
          <span>{step?.title ?? ''}</span>
          <span>Step {current} of {total}</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-white/70 transition-all" style={{ width: `${fraction * 100}%` }} />
        </div>
        {renderPreview && <div className="mt-3">{renderPreview(flow.collectedData, fraction)}</div>}
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
          <p className="text-xs text-white/50">This step has no UI.</p>
        )}
      </div>

      {flow.error && (
        <p role="alert" className="px-4 pb-1 text-xs text-red-300">{flow.error}</p>
      )}

      <footer className="flex items-center gap-2 px-4 pb-4 pt-2">
        <span className="flex-1" />
        {flow.isFirst ? (
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
        ) : (
          <Button variant="secondary" disabled={saving} onClick={() => flow.back()}>
            Back
          </Button>
        )}
        <Button variant="primary" disabled={saving} onClick={() => void advance()}>
          {saving ? 'Saving' : flow.isLast ? 'Save' : 'Continue →'}
        </Button>
      </footer>
    </Dialog>
  )
}
