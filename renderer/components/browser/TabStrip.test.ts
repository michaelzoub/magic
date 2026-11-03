import { describe, expect, it } from 'vitest'
import { dragTarget } from './tabDrag'

const step = 100

describe('dragTarget', () => {
  it('stays in the current slot until the tab centre crosses a neighbour centre', () => {
    expect(dragTarget(1, 0, step, 4)).toBe(1)
    expect(dragTarget(1, step / 2 - 1, step, 4)).toBe(1)
    expect(dragTarget(1, -step / 2 + 1, step, 4)).toBe(1)
  })

  it('swaps once past the half-slot, in either direction', () => {
    expect(dragTarget(1, step / 2 + 1, step, 4)).toBe(2)
    expect(dragTarget(1, -step / 2 - 1, step, 4)).toBe(0)
    expect(dragTarget(0, 2.6 * step, step, 4)).toBe(3)
  })

  it('clamps to the strip ends', () => {
    expect(dragTarget(0, -5 * step, step, 4)).toBe(0)
    expect(dragTarget(3, 5 * step, step, 4)).toBe(3)
  })

  it('is grab-point independent: only displacement from the slot matters', () => {
    // Same dragged-tab displacement yields the same target regardless of
    // where inside the tab the pointer went down (that offset never enters).
    for (const from of [0, 1, 2]) {
      expect(dragTarget(from, 0.49 * step, step, 4)).toBe(from)
      expect(dragTarget(from, 0.51 * step, step, 4)).toBe(Math.min(from + 1, 3))
    }
  })

  it('guards against a non-positive step', () => {
    expect(dragTarget(2, 500, 0, 4)).toBe(2)
  })
})
