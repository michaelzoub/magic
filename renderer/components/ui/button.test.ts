import { describe, expect, it } from 'vitest'
import { buttonClasses } from './Button'

/** The shared button scale: 28px default, 32px ceiling, 6px radius, 14px icons. */
describe('shared button scale', () => {
  it('defaults to 28px tall with 6px radius and no larger height', () => {
    const cls = buttonClasses()
    expect(cls).toContain('h-7')
    expect(cls).toContain('rounded-[6px]')
    expect(cls).toContain('[&_svg]:size-3.5')
    expect(cls).not.toMatch(/h-(8|9|10|11)/)
  })

  it('caps the large size at 32px', () => {
    expect(buttonClasses('primary', 'md')).toContain('h-8')
  })

  it('keeps a focus indicator on every variant', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'dark', 'light', 'chromeGhost'] as const) {
      expect(buttonClasses(variant)).toContain('focus-visible:ring-1')
    }
  })
})
