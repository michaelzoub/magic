import { describe, expect, it } from 'vitest'
import { createIdentitySpec } from '@core/identity'
import { sampleTotemCell } from './renderTotem'

describe('sampleTotemCell', () => {
  const spec = createIdentitySpec('v1.00000008')

  it('is four-way symmetric when the spec calls for it', () => {
    expect(spec.symmetry).toBe('both')
    const last = spec.cols - 1
    for (let y = 0; y < spec.cols; y++) {
      for (let x = 0; x < spec.cols; x++) {
        const c = sampleTotemCell(spec, x, y).color
        expect(sampleTotemCell(spec, last - x, y).color).toBe(c)
        expect(sampleTotemCell(spec, x, last - y).color).toBe(c)
        expect(sampleTotemCell(spec, last - x, last - y).color).toBe(c)
      }
    }
  })

  it('produces a colourful grid with a deterministic reveal order in 0..1', () => {
    const colors = new Set<string>()
    for (let y = 0; y < spec.cols; y++) {
      for (let x = 0; x < spec.cols; x++) {
        const cell = sampleTotemCell(spec, x, y)
        colors.add(cell.color)
        expect(cell.rank).toBeGreaterThanOrEqual(0)
        expect(cell.rank).toBeLessThanOrEqual(1)
        expect(sampleTotemCell(spec, x, y)).toEqual(cell)
      }
    }
    expect(colors.size).toBeGreaterThanOrEqual(3)
  })
})
