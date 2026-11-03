import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { menuPosition, type SurfaceKind, type SurfaceRequest } from '@shared/overlay'
import type { OnboardingFlow } from '@core/onboarding'
import { MemoryDialog } from '@/components/memory/MemoryDialog'
import { ImportLoginsDialog } from '@/components/imports/ImportLoginsDialog'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { createOnboarding } from '@/features/onboarding/onboarding'
import { WorkspaceMenuContent } from '@/components/workspaces/WorkspaceSwitcher'
import { surface } from '@/components/ui/surface'

/**
 * Renderer for the native overlay view (see main/browser/floating-overlay.ts).
 * It receives one serializable surface request at a time from the shell and
 * sends user actions back; all stateful feature logic that can live here
 * (import detection, the onboarding flow) does, so the shell never has to
 * detach or paint over the page view to show a dialog/dropdown.
 */
export function OverlayApp() {
  const host = window.overlayHost
  const [req, setReq] = useState<SurfaceRequest | null>(null)
  const onboardingFlow = useRef<OnboardingFlow | null>(null)

  useEffect(() => host?.onSurface(setReq), [host])

  const close = (kind: SurfaceKind) => {
    console.log('CLOSE CALLED', kind, new Error().stack)
    setReq(null)
    host?.dismiss(kind)
  }

  useEffect(() => {
    if (req?.kind !== 'workspace-menu') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close('workspace-menu')
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req])

  if (!host || !req) return null

  if (req.kind === 'memory') {
    return (
      <MemoryDialog
        open
        checkpoints={req.checkpoints}
        onClose={() => close('memory')}
        onNavigate={(checkpointId, target) => {
          void host.requestAction({ type: 'memory:navigate', checkpointId, target })
          close('memory')
        }}
      />
    )
  }

  if (req.kind === 'import') {
    return (
      <ImportLoginsDialog
        open
        onClose={() => close('import')}
        onImported={() => void host.requestAction({ type: 'import:imported' })}
      />
    )
  }

  if (req.kind === 'onboarding') {
    if (!onboardingFlow.current) onboardingFlow.current = createOnboarding()
    return (
      <OnboardingWizard
        flow={onboardingFlow.current}
        open
        onClose={() => close('onboarding')}
        title="Welcome to Magic"
      />
    )
  }

  return <WorkspaceMenuSurface req={req} onClose={() => close('workspace-menu')} />
}

function WorkspaceMenuSurface({ req, onClose }: {
  req: Extract<SurfaceRequest, { kind: 'workspace-menu' }>
  onClose(): void
}) {
  const host = window.overlayHost!
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(() =>
    menuPosition(req, { width: 200, height: 320 }, { width: window.innerWidth, height: window.innerHeight })
  )

  // Clamp with the panel's real height once it has mounted.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos(menuPosition(req, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0" onPointerDown={(e) => { console.log('MENU POINTERDOWN', e.isTrusted, e.pointerType, e.clientX, e.clientY, e.target === e.currentTarget); e.target === e.currentTarget && onClose() }}>
      <div
        ref={panelRef}
        role="menu"
        aria-label="Switch workspace"
        className={`no-drag fixed z-50 rounded-[8px] p-1 text-[12px] animate-[pop-in_120ms_ease-out] ${surface}`}
        style={{ left: pos.x, top: pos.y, width: pos.width }}
      >
        <WorkspaceMenuContent
          workspaces={req.workspaces}
          activeId={req.activeId}
          onSelect={(id) => {
            void host.requestAction({ type: 'workspace:select', id })
            onClose()
          }}
          onCreate={async (name, goal) => {
            const err = (await host.requestAction({ type: 'workspace:create', name, goal })) as string | null
            if (!err) onClose()
            return err
          }}
        />
      </div>
    </div>
  )
}
