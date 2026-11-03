import { describe, expect, it, vi } from 'vitest'
import { OnboardingFlow } from './flow'
import { OnboardingStep } from './step'

const nameStep = () =>
  new OnboardingStep<string>({
    id: 'name',
    validate: (v) => (v?.trim() ? null : 'Name is required')
  })
const goalStep = () => new OnboardingStep<string>({ id: 'goal', initialValue: 'Focus' })
const proStep = () =>
  new OnboardingStep<string>({ id: 'pro', isEnabled: (data) => data.goal === 'pro' })

describe('OnboardingFlow', () => {
  it('counts the step objects it was created from', () => {
    const flow = OnboardingFlow.create([nameStep(), goalStep(), proStep()], { onSave: vi.fn() })
    expect(flow.registeredSteps).toBe(3)
    expect(flow.totalSteps).toBe(2) // pro is disabled until data.goal === 'pro'
    expect(flow.progress).toEqual({ current: 1, total: 2, fraction: 0.5 })
    flow.setValue('goal', 'pro')
    expect(flow.totalSteps).toBe(3)
  })

  it('rejects empty flows and duplicate step ids', () => {
    expect(() => OnboardingFlow.create([], { onSave: vi.fn() })).toThrow(/at least one step/)
    expect(() => OnboardingFlow.create([nameStep(), nameStep()], { onSave: vi.fn() })).toThrow(/Duplicate/)
    expect(() => new OnboardingStep({ id: ' ' })).toThrow(/id is required/)
  })

  it('seeds initial values and collects data keyed by step id', () => {
    const flow = OnboardingFlow.create([nameStep(), goalStep()], { onSave: vi.fn() })
    expect(flow.value('goal')).toBe('Focus')
    flow.setValue('name', 'Ada')
    expect(flow.collectedData).toEqual({ name: 'Ada', goal: 'Focus' })
    expect(() => flow.setValue('nope', 1)).toThrow(/Unknown/)
  })

  it('blocks next() on validation and advances when valid', async () => {
    const flow = OnboardingFlow.create([nameStep(), goalStep()], { onSave: vi.fn() })
    expect(await flow.next()).toBe(false)
    expect(flow.error).toBe('Name is required')
    expect(flow.currentStep?.id).toBe('name')
    flow.setValue('name', 'Ada')
    expect(await flow.next()).toBe(true)
    expect(flow.currentStep?.id).toBe('goal')
    expect(flow.isLast).toBe(true)
    expect(flow.back()).toBe(true)
    expect(flow.currentStep?.id).toBe('name')
  })

  it('saves all data exactly once on finish, even under concurrent calls', async () => {
    const onSave = vi.fn(async () => {})
    const flow = OnboardingFlow.create([nameStep(), goalStep()], { onSave })
    flow.setValue('name', 'Ada')
    const [a, b] = await Promise.all([flow.finish(), flow.finish()])
    expect([a, b]).toEqual([true, true])
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ name: 'Ada', goal: 'Focus' })
    expect(flow.status).toBe('completed')
    expect(await flow.finish()).toBe(true)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('jumps to the first invalid step on finish', async () => {
    const onSave = vi.fn()
    const flow = OnboardingFlow.create([nameStep(), goalStep()], { onSave })
    flow.goToStep('goal')
    expect(await flow.finish()).toBe(false)
    expect(flow.currentStep?.id).toBe('name')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('exposes a failed save as save-error and allows retry', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    const flow = OnboardingFlow.create([goalStep()], { onSave })
    expect(await flow.finish()).toBe(false)
    expect(flow.status).toBe('save-error')
    expect(flow.error).toBe('offline')
    expect(await flow.finish()).toBe(true)
    expect(flow.status).toBe('completed')
  })

  it('notifies subscribers on navigation and data changes', async () => {
    const listener = vi.fn()
    const flow = OnboardingFlow.create([nameStep(), goalStep()], { onSave: vi.fn() })
    const off = flow.subscribe(listener)
    flow.setValue('name', 'Ada')
    await flow.next()
    expect(listener).toHaveBeenCalledTimes(3) // setValue, validate, advance
    off()
    flow.back()
    expect(listener).toHaveBeenCalledTimes(3)
  })
})
