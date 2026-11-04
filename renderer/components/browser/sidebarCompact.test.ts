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

  it('makes the whole "Your workspaces" header row open the menu, not just the +', () => {
    const header = sidebar.slice(sidebar.indexOf('Your workspaces') - 900, sidebar.indexOf('Your workspaces'))
    expect(header).toContain('cursor-pointer')
    expect(header).toContain("querySelector<HTMLElement>('[data-workspace-menu]')")
    // Workspace rows show a pointer over their full-width button too.
    expect(switcher).toContain('relative cursor-pointer')
  })

  it('keeps count badges small and subtle', () => {
    const start = switcher.indexOf('function CountBadge')
    const badge = switcher.slice(start, switcher.indexOf('/*', start))
    expect(badge).toContain('h-4 min-w-4')
    expect(badge).toContain('text-3xs')
    expect(badge).toContain('text-chrome-faint')
    expect(badge).not.toMatch(/border|ring-/)
  })

  it('has no "Workspaces" nav row — the + in the section header opens the menu', () => {
    expect(switcher).not.toContain('aria-label="Workspaces"')
    expect(switcher).not.toContain('<span className="truncate">Workspaces</span>')
    // The + trigger (both the header button and the rail row) is the menu.
    expect(switcher).toContain('data-workspace-menu')
    expect(switcher).toContain('aria-label="New workspace"')
    // Sidebar no longer renders a Workspaces row in the top nav, nor
    // forwards the + click to a hidden trigger.
    const nav = sidebar.slice(sidebar.indexOf('<nav'), sidebar.indexOf('</nav>'))
    expect(nav).not.toContain('WorkspaceMenu')
    expect(sidebar).not.toContain('openWorkspaceMenu')
    expect(sidebar).toContain('<WorkspaceMenu')
  })

  it('is drag-resizable within bounds, persisted, with a keyboard-operable handle', () => {
    const min = Number(sidebar.match(/SIDEBAR_MIN_WIDTH = (\d+)/)?.[1])
    const max = Number(sidebar.match(/SIDEBAR_MAX_WIDTH = (\d+)/)?.[1])
    expect(min).toBeGreaterThanOrEqual(192) // labels never render truncated
    expect(max).toBeGreaterThan(min)
    expect(sidebar).toContain('aria-label="Resize sidebar"')
    expect(sidebar).toContain("role=\"separator\"")
    expect(sidebar).toContain('cursor-col-resize')
    expect(sidebar).toContain('localStorage')
    expect(sidebar).toContain('ArrowRight')
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
