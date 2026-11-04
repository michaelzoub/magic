import { describe, expect, it } from 'vitest'
import { buttonClasses, type ButtonVariant } from './Button'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'dark', 'light', 'chromeGhost']

/** One thin button scale project-wide: no size prop, so no two action buttons can mismatch. */
describe('shared button scale', () => {
  it('is 28px tall with 6px radius and 14px icons, and no larger height', () => {
    const cls = buttonClasses()
    expect(cls).toContain('h-7')
    expect(cls).toContain('rounded-[6px]')
    expect(cls).toContain('[&_svg]:size-3.5')
    expect(cls).not.toMatch(/h-(8|9|10|11)/)
  })

  it('gives every variant the same height, so paired actions are always equal', () => {
    for (const variant of VARIANTS) {
      expect(buttonClasses(variant)).toContain('h-7')
      expect(buttonClasses(variant)).not.toMatch(/h-(8|9|10|11)/)
    }
  })

  it('keeps a focus indicator on every variant', () => {
    for (const variant of VARIANTS) {
      expect(buttonClasses(variant)).toContain('focus-visible:ring-1')
    }
  })
})
