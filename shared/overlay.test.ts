import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { menuPosition, type SurfaceRequest } from './overlay'

const menu = (placement: 'bottom-start' | 'right-start'): Extract<SurfaceRequest, { kind: 'workspace-menu' }> => ({
  kind: 'workspace-menu',
  anchor: { x: 10, y: 100, width: 232, height: 36 },
  placement,
  workspaces: [],
  activeId: null
})

describe('menuPosition', () => {
  it('opens below the trigger at trigger width for bottom-start', () => {
    expect(menuPosition(menu('bottom-start'), { width: 232, height: 200 }, { width: 1280, height: 820 })).toEqual({
      x: 10,
      y: 140,
      width: 232
    })
  })

  it('opens beside the trigger at fixed width for right-start (collapsed rail)', () => {
    const req = { ...menu('right-start'), anchor: { x: 6, y: 100, width: 40, height: 36 } }
    expect(menuPosition(req, { width: 200, height: 200 }, { width: 1280, height: 820 })).toEqual({
      x: 54,
      y: 100,
      width: 200
    })
  })

  it('clamps the panel inside the window', () => {
    const req = { ...menu('bottom-start'), anchor: { x: 1200, y: 780, width: 232, height: 36 } }
    const pos = menuPosition(req, { width: 232, height: 200 }, { width: 1280, height: 820 })
    expect(pos.x + pos.width).toBeLessThanOrEqual(1280 - 4)
    expect(pos.y + 200).toBeLessThanOrEqual(820 - 4)
  })
})

describe('no paint-over of the native page view', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

  it('the viewport never captures or detaches the page under a dialog/dropdown', () => {
    const viewport = read('../renderer/components/browser/Viewport.tsx')
    expect(viewport).not.toContain('capturePage')
    expect(viewport).not.toContain('DETACHED')
    expect(viewport).not.toContain('hidden?:')
    expect(viewport).not.toContain('setViewportBounds(DETACHED')
  })

  it('the engine contract has no screenshot API to paint over the page with', () => {
    expect(read('./engine.ts')).not.toContain('capturePage')
    expect(read('../main/browser/electron-engine.ts')).not.toContain('capturePage')
  })

  it('dialogs/dropdowns are hosted in a native WebContentsView layer', () => {
    const overlay = read('../main/browser/floating-overlay.ts')
    expect(overlay).toContain('WebContentsView')
    expect(overlay).toContain('addChildView')
    expect(overlay).toContain("setBackgroundColor('#00000000')")
  })
})
