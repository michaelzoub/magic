import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { magicPopoverPosition, menuPosition, type SurfaceKind, type SurfaceRequest } from '@shared/overlay'
import type { AgentRunResult, AgentSwitchNoticeState } from '@shared/agent'
import type { OnboardingFlow } from '@core/onboarding'
import { MemoryDialog } from '@/components/memory/MemoryDialog'
import { ImportLoginsDialog } from '@/components/imports/ImportLoginsDialog'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { createOnboarding } from '@/features/onboarding/onboarding'
import { OnboardingTotemPreview, OnboardingTotemReveal, ProfileIdentityDialog } from '@/features/identity'
import { updateProfile } from '@/features/onboarding/completeOnboarding'
import { WorkspaceMenuContent } from '@/components/workspaces/WorkspaceSwitcher'
import { MagicPopoverContent } from '@/components/browser/MagicPopover'
import { AgentSwitchNotice } from '@/components/browser/AgentSwitchNotice'
import { WorkspaceDriftNotice } from '@/components/browser/WorkspaceDriftNotice'
import type { WorkspaceDriftNoticeState } from '@shared/overlay'
import { surface } from '@/components/ui/surface'
import { motion } from '@/motion'

/**
 * Renderer for the native overlay view (see main/browser/floating-overlay.ts).
 * It receives one serializable surface request at a time from the shell and
 * sends user actions back; all stateful feature logic that can live here
 * (import detection, the onboarding flow) does, so the shell never has to
 * detach or paint over the page view to show a dialog/dropdown.
 */
export function OverlayApp() {
  const host = window.overlayHost
  const [notice, setNotice] = useState<AgentSwitchNoticeState | null>(null)
  useEffect(() => host?.onAgentNotice(setNotice), [host])
  const [drift, setDrift] = useState<WorkspaceDriftNoticeState | null>(null)
  useEffect(() => host?.onDriftNotice(setDrift), [host])
  return (
    <>
      <OverlaySurface />
      {drift && host && (
        <WorkspaceDriftNotice
          workspaceName={drift.workspaceName}
          onDismiss={() => { void host.requestAction({ type: 'drift:dismiss-notice' }) }}
        />
      )}
      {notice && host && (
        <AgentSwitchNotice
          notice={notice}
          // No local setNotice(null): the shell clears its notice on
          // apply/dismiss and pushes null back, so the component's own
          // exit animation is what unmounts it.
          onApply={(proposals) => { void host.requestAction({ type: 'agent:apply-proposals', proposals }) }}
          onDismiss={() => { void host.requestAction({ type: 'agent:dismiss-notice' }) }}
        />
      )}
    </>
  )
}

function OverlaySurface() {
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
    if (req?.kind !== 'workspace-menu' && req?.kind !== 'magic-popover') return
    const kind = req.kind
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(kind)
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
        workspaces={req.workspaces}
        onClose={() => close('memory')}
        onNavigate={(checkpointId, target) => {
          void host.requestAction({ type: 'memory:navigate', checkpointId, target })
          close('memory')
        }}
      />
    )
  }

  if (req.kind === 'profile') {
    return (
      <ProfileIdentityDialog
        open
        completed={req.completed}
        onClose={() => close('profile')}
        onImportLogins={() => setReq({ kind: 'import' })}
        onSaveProfile={async (input) => {
          const updated = await updateProfile(input)
          setReq({ kind: 'profile', completed: updated })
          // Tell the shell so its sidebar name + stored profile update too.
          await host.requestAction({ type: 'profile:updated', completed: updated })
          return updated
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
        renderPreview={(data, progress) => <OnboardingTotemPreview data={data} progress={progress} />}
        renderCompletion={(data) => <OnboardingTotemReveal data={data} />}
      />
    )
  }

  if (req.kind === 'magic-popover') {
    return <MagicPopoverSurface req={req} onClose={() => close('magic-popover')} />
  }

  return (
    <WorkspaceMenuSurface
      req={req}
      onClose={() => close('workspace-menu')}
      onDeleted={(id, activeId) =>
        setReq((r) =>
          r?.kind === 'workspace-menu' ? { ...r, workspaces: r.workspaces.filter((w) => w.id !== id), activeId } : r
        )
      }
    />
  )
}

function WorkspaceMenuSurface({ req, onClose, onDeleted }: {
  req: Extract<SurfaceRequest, { kind: 'workspace-menu' }>
  onClose(): void
  /** Drop the deleted row locally (the shell does not re-push the menu) and adopt the fallback active id. */
  onDeleted(id: string, activeId: string | null): void
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
        className={`no-drag fixed z-50 rounded-[8px] p-1 text-xs animate-[pop-in_120ms_ease-out] ${surface}`}
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
          onDelete={async (id) => {
            const activeId = (await host.requestAction({ type: 'workspace:delete', id })) as string | null
            onDeleted(id, activeId)
          }}
        />
      </div>
    </div>
  )
}

/**
 * Compact popover anchored to the sidebar's magic asterisk. Rendered in
 * the native overlay layer over a full-window backdrop, so it never
 * resizes the page view or persists as a panel; a backdrop click or
 * Escape (handled in OverlayApp) closes it.
 */
function MagicPopoverSurface({ req, onClose }: {
  req: Extract<SurfaceRequest, { kind: 'magic-popover' }>
  onClose(): void
}) {
  const host = window.overlayHost!
  const [context, setContext] = useState(req.context)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(() =>
    magicPopoverPosition(req.anchor, { height: 200 }, { width: window.innerWidth, height: window.innerHeight })
  )

  // Re-clamp whenever the panel's real height changes (chat transcript
  // growing, panels expanding, window resizing). A one-shot measurement on
  // mount left the taller panel hanging off the bottom edge: the anchor
  // sits near the window bottom, so growth must move the panel up.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    motion.popIn(el)
    const update = () => {
      const r = el.getBoundingClientRect()
      const next = magicPopoverPosition(req.anchor, { height: r.height }, { width: window.innerWidth, height: window.innerHeight })
      setPos((prev) => (prev.x === next.x && prev.y === next.y && prev.width === next.width ? prev : next))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.anchor])

  return (
    <div className="fixed inset-0" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Magic"
        className="no-drag fixed z-50 flex max-h-[calc(100vh-8px)] flex-col overflow-hidden rounded-lg bg-white text-neutral-900 shadow-[0_24px_70px_rgb(0_0_0/0.28)]"
        style={{ left: pos.x, top: pos.y, width: pos.width }}
      >
        <MagicPopoverContent
          onClose={onClose}
          context={context}
          onOpenTab={(tab) => {
            void host.requestAction({ type: 'magic:open-tab', workspaceId: tab.workspaceId, tabId: tab.id })
            onClose()
          }}
          onResume={(workspaceId) => {
            void host.requestAction({ type: 'workspace:select', id: workspaceId })
            onClose()
          }}
          onAsk={async (request, onEvent) => {
            // The action itself is request/response; live stream events are
            // pushed back separately under this id (see App's magic:ask case).
            const streamId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
            const unsubscribe = onEvent
              ? host.onAgentEvent((id, event) => {
                  if (id === streamId) onEvent(event)
                })
              : () => {}
            try {
              return (await host.requestAction({ type: 'magic:ask', request, streamId })) as AgentRunResult
            } finally {
              unsubscribe()
            }
          }}
          onSetAssistance={async (active) => {
            const next = (await host.requestAction({ type: 'magic:set-assistance', active })) as typeof context.assistance
            setContext((c) => ({ ...c, assistance: next }))
          }}
          onSetExclusions={async (excludedSites, excludedWorkspaceIds) => {
            const next = (await host.requestAction({ type: 'magic:set-exclusions', excludedSites, excludedWorkspaceIds })) as typeof context.assistance
            setContext((c) => ({ ...c, assistance: next }))
          }}
          onUndo={(checkpointId) => {
            void host.requestAction({ type: 'magic:undo', checkpointId })
            onClose()
          }}
        />
      </div>
    </div>
  )
}
