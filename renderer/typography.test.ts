import { fileURLToPath } from 'node:url'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = fileURLToPath(new URL('.', import.meta.url))
const config = readFileSync(join(here, '../tailwind.config.js'), 'utf8')

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return tsxFiles(path)
    return e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx') ? [path] : []
  })

/** Typography comes from the named scale in tailwind.config.js — no arbitrary sizes. */
describe('typography scale', () => {
  it('defines the full named scale', () => {
    for (const token of ["'3xs': ['10px'", "'2xs': ['11px'", "xs: ['12px'", "sm: ['13px'", "base: ['14px'", "lg: ['15px'", "xl: ['18px'", "'2xl': ['20px'"]) {
      expect(config).toContain(token)
    }
  })

  it('uses no arbitrary text-[Npx] sizes in components', () => {
    const offenders = tsxFiles(here).filter((f) => /text-\[\d+px\]/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('keeps navigation on the xs token', () => {
    const switcher = readFileSync(join(here, 'components/workspaces/WorkspaceSwitcher.tsx'), 'utf8')
    expect(switcher).toContain('sidebarRow = `no-drag flex h-7 w-full items-center gap-1.5 overflow-hidden rounded-[6px] px-2 text-xs')
  })
})
