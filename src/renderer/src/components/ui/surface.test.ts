import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { surface } from './surface'

const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')

/** Every popup, dropdown, menu, tooltip, and dialog must have a charcoal bg. */
describe('floating surfaces', () => {
  it('the shared surface is charcoal, not pure black', () => {
    expect(surface).toContain('bg-neutral-800')
    expect(surface).not.toContain('bg-black')
    expect(surface).not.toMatch(/bg-\[#/)
  })

  it.each(['./Popover.tsx', './Tooltip.tsx', './Dialog.tsx'])('%s composes the shared surface, with no bg of its own', (file) => {
    const src = read(file)
    expect(src).toContain("from './surface'")
    expect(src).toContain('${surface}')
    // No hard-coded surface colour of its own; only the shared charcoal one.
    expect(src).not.toContain('bg-[#')
  })

  it('the native tooltip overlay mirrors the charcoal surface', () => {
    // neutral-800
    expect(read('../../../../main/tooltip-overlay.ts')).toContain('background:#262626')
  })
})
