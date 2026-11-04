import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sidebar = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8')
const switcher = readFileSync(new URL('../workspaces/WorkspaceSwitcher.tsx', import.meta.url), 'utf8')

/** Compact sidebar: 220–240px wide, 28px rows, subtle count badges, fill-based states. */
describe('compact sidebar', () => {
  it('keeps the expanded width within 220–240px', () => {
    const width = Number(sidebar.match(/SIDEBAR_WIDTH = (\d+)/)?.[1])
    expect(width).toBeGreaterThanOrEqual(220)
    expect(width).toBeLessThanOrEqual(240)
  })

  it('uses 28px rows with a 6px icon-to-label gap', () => {
    expect(switcher).toContain('h-7 w-full items-center gap-1.5')
    expect(switcher).not.toContain('h-8 w-full')
  })

  it('keeps count badges small and subtle', () => {
    const start = switcher.indexOf('function CountBadge')
    const badge = switcher.slice(start, switcher.indexOf('/*', start))
    expect(badge).toContain('h-4 min-w-4')
    expect(badge).toContain('text-3xs')
    expect(badge).toContain('text-chrome-faint')
    expect(badge).not.toMatch(/border|ring-/)
  })

  it('carries active/selected states with background fills, not borders', () => {
    expect(switcher).toContain('bg-chrome-hover/[0.10] font-medium')
    // Row geometry and selected-state lines only: focus/error rings on the
    // create-workspace inputs elsewhere in the file are intentional.
    const rows = switcher.slice(switcher.indexOf('sidebarRow'), switcher.indexOf('function CountBadge'))
    expect(rows).not.toMatch(/border|ring-/)
    expect(sidebar).not.toMatch(/border|ring-/)
  })
})
