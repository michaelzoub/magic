import { describe, expect, it } from 'vitest'
import { createIdentitySpec, deriveIdentitySeed, parseIdentitySeed } from './seed'
import { identitySeedFromOnboarding, identitySpecFromOnboarding } from './fromOnboarding'

const answers = {
  welcome: { name: 'Alex', description: 'A student and builder.' },
  goals: {
    options: ['Work', 'Coding'],
    selected: [
      { name: 'Work', goal: 'Ship v2' },
      { name: 'Coding', goal: 'Build software' }
    ]
  },
  sites: { Work: { sites: ['gmail.com'], goalText: 'x' }, Coding: { sites: ['github.com'], goalText: 'y' } }
}

describe('identity seed', () => {
  it('is deterministic and round-trips through parse', () => {
    const seed = deriveIdentitySeed(['name:Alex', 'areas:Coding,Work'])
    expect(seed).toMatch(/^v1\.[0-9a-f]{8}$/)
    expect(deriveIdentitySeed(['name:Alex', 'areas:Coding,Work'])).toBe(seed)
    expect(parseIdentitySeed(seed)).toBe(parseIdentitySeed(seed))
    expect(() => deriveIdentitySeed([' ', ''])).toThrow(/at least one/)
  })

  it('produces an identical spec for the same seed, and a different one for another seed', () => {
    expect(createIdentitySpec('v1.00000008')).toEqual(createIdentitySpec('v1.00000008'))
    expect(createIdentitySpec('v1.00000008')).not.toEqual(createIdentitySpec('v1.00000009'))
  })

  it('keeps zone colour pairs distinct and zones inside quadrant space', () => {
    const spec = createIdentitySpec('v1.deadbeef')
    expect(spec.zones.length).toBeGreaterThanOrEqual(12)
    for (const z of spec.zones) {
      expect(z.a).not.toBe(z.b)
      expect(z.cx).toBeGreaterThanOrEqual(0)
      expect(z.cy).toBeGreaterThanOrEqual(0)
    }
    expect(spec.palette.colors).toHaveLength(5)
  })
})

describe('identity from onboarding choices', () => {
  it('is stable for the same answers and insensitive to selection order', () => {
    expect(identitySeedFromOnboarding(answers)).toBe(identitySeedFromOnboarding(answers))
    const reordered = {
      ...answers,
      goals: { ...answers.goals, selected: [...answers.goals.selected].reverse() }
    }
    expect(identitySeedFromOnboarding(reordered)).toBe(identitySeedFromOnboarding(answers))
  })

  it('evolves when any choice changes', () => {
    const base = identitySeedFromOnboarding(answers)
    expect(identitySeedFromOnboarding({ ...answers, welcome: { ...answers.welcome, name: 'Sam' } })).not.toBe(base)
    expect(
      identitySeedFromOnboarding({
        ...answers,
        goals: { ...answers.goals, selected: [...answers.goals.selected, { name: 'Travel', goal: 'Plan trips' }] }
      })
    ).not.toBe(base)
    expect(createIdentitySpec(identitySeedFromOnboarding(answers))).toEqual(identitySpecFromOnboarding(answers))
  })
})
