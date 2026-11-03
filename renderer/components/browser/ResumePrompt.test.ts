import { describe, expect, it } from 'vitest'
import { switchDay } from './ResumePrompt'

const now = new Date(2026, 10, 3, 15, 0).getTime() // Tue Nov 3 2026, 3pm
const hoursAgo = (h: number) => now - h * 3_600_000

describe('switchDay', () => {
  it('labels the most recent switch like the prompt copy expects', () => {
    expect(switchDay(hoursAgo(2), now)).toBe('Today')
    expect(switchDay(hoursAgo(26), now)).toBe('Yesterday')
  })

  it('falls back to weekday, then date, for older switches', () => {
    expect(switchDay(hoursAgo(3 * 24), now)).toBe('Saturday')
    expect(switchDay(new Date(2026, 9, 12).getTime(), now)).toBe('Oct 12')
  })
})
