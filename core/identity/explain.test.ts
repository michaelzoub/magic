import { describe, expect, it } from 'vitest'
import { buildIdentityReport, buildIdentityReportFromCompleted, buildIdentityExplanation } from './explain'

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

describe('buildIdentityReport', () => {
  it('lists every answered decision with a fingerprint and a leave-one-out counterfactual', () => {
    const report = buildIdentityReport(answers)
    expect(report.influences.map((i) => i.id)).toEqual(['name', 'description', 'areas', 'goals', 'sites'])
    expect(report.influences.find((i) => i.id === 'areas')!.summary).toBe('Coding, Work')
    for (const influence of report.influences) {
      expect(influence.fingerprint).toMatch(/^[0-9a-f]{6}$/)
      // Removing any decision must re-seed the totem.
      expect(influence.counterfactual.seed).not.toBe(report.seed)
    }
    expect(report.seedPreserved).toBe(false)
  })

  it('flags a persisted seed kept from an earlier completion', () => {
    const report = buildIdentityReport(answers, 'v1.00000008')
    expect(report.seed).toBe('v1.00000008')
    expect(report.seedPreserved).toBe(true)
  })

  it('prefers the canonical identityInputs stored at completion', () => {
    const fromAnswers = buildIdentityReport(answers)
    const completed = {
      profile: {
        displayName: 'Alex', goal: 'composed goal text that differs from the raw answers',
        identitySeed: fromAnswers.seed, onboardingCompletedAt: 1000, createdAt: 1000, updatedAt: 1000
      },
      settings: {
        // Stored goals have sites concatenated in; identityInputs do not.
        goals: [{ name: 'Coding', goal: 'Build software For Coding, sites include github.com.' }],
        identityInputs: [
          { id: 'name', label: 'Your name', part: 'name:Alex', summary: 'Alex' },
          { id: 'description', label: 'Your description', part: 'description:A student and builder.', summary: 'A student and builder.' },
          { id: 'areas', label: 'Areas you picked', part: 'areas:Coding,Work', summary: 'Coding, Work' },
          // Legacy stored summary: goals joined with a decorative middle dot.
          { id: 'goals', label: 'Goals you set', part: 'goals:Build software,Ship v2', summary: 'Build software · Ship v2' },
          { id: 'sites', label: 'Example sites', part: 'sites:github.com,gmail.com', summary: 'github.com, gmail.com' }
        ]
      }
    }
    const report = buildIdentityReportFromCompleted(completed)!
    expect(report.seedPreserved).toBe(false)
    expect(report.spec).toEqual(fromAnswers.spec)
    expect(report.influences.find((i) => i.id === 'goals')!.summary).toBe('Build software · Ship v2')
    // The human-readable explanation normalises the legacy separator away.
    const explanation = buildIdentityExplanation(completed)!
    expect(explanation.influences.find((i) => i.id === 'goals')!.summary).toBe('Build software, Ship v2')
  })

  it('explains the totem in human-readable terms derived from the actual spec', () => {
    const report = buildIdentityReport(answers)
    const explanation = buildIdentityExplanation({
      profile: {
        displayName: 'Alex', goal: 'Ship v2', identitySeed: report.seed,
        onboardingCompletedAt: 1000, createdAt: 1000, updatedAt: 1000
      },
      settings: {
        description: 'A student and builder.',
        goals: [
          { name: 'Work', goal: 'Ship v2' },
          { name: 'Coding', goal: 'Build software' }
        ],
        sites: { Work: ['gmail.com'], Coding: ['github.com'] }
      }
    })!
    expect(explanation.paletteName).toBe(report.spec.palette.name)
    // Patterns are exactly the fill patterns present in the generated zones.
    const expectedPatterns = [...new Set(report.spec.zones.map((z) => z.pattern))]
    expect(explanation.patterns).toHaveLength(expectedPatterns.length)
    expect(explanation.symmetry).toBe(
      report.spec.symmetry === 'both' ? 'mirrored side to side and top to bottom' : 'mirrored side to side'
    )
    expect(explanation.influences.map((i) => i.summary)).toEqual(report.influences.map((i) => i.summary))
    // Nothing technical leaks into the explanation.
    const text = JSON.stringify(explanation)
    expect(text).not.toContain(report.seed)
    expect(text).not.toMatch(/fingerprint|counterfactual|seed|hash/i)
    for (const influence of report.influences) expect(text).not.toContain(influence.fingerprint)
  })

  it('rebuilds the same report from a stored profile + settings', () => {
    const fromAnswers = buildIdentityReport(answers)
    const report = buildIdentityReportFromCompleted({
      profile: {
        displayName: 'Alex', goal: 'Ship v2', identitySeed: fromAnswers.seed,
        onboardingCompletedAt: 1000, createdAt: 1000, updatedAt: 1000
      },
      settings: {
        description: 'A student and builder.',
        goals: [
          { name: 'Work', goal: 'Ship v2' },
          { name: 'Coding', goal: 'Build software' }
        ],
        sites: { Work: ['gmail.com'], Coding: ['github.com'] }
      }
    })!
    expect(report.seed).toBe(fromAnswers.seed)
    expect(report.spec).toEqual(fromAnswers.spec)
    expect(report.influences.map((i) => i.summary)).toEqual(fromAnswers.influences.map((i) => i.summary))
  })
})
