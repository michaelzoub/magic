import { BrowserWindow, WebContentsView } from 'electron'
import { join } from 'node:path'
import { OVERLAY_IPC, type SurfaceRequest, type WorkspaceDriftNoticeState } from '@shared/overlay'
import type { AgentSwitchNoticeState } from '@shared/agent'

/**
 * Native layer for dialogs and dropdowns: one transparent WebContentsView
 * stacked above the page views, hosting the overlay renderer
 * (renderer/overlay). The page view is never detached, shrunk, or painted
 * over with a capture while a surface is open — this view simply composites
 * above it, and is removed from the window when no surface is shown.
 */
export class FloatingOverlay {
  private view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  private current: SurfaceRequest | null = null
  private notice: AgentSwitchNoticeState | null = null
  private drift: WorkspaceDriftNoticeState | null = null
  private ready = false
  /** Rendered height of the agent notice panel, reported by the overlay renderer (0 = not yet measured). */
  private noticeHeight = 0

  constructor(private window: BrowserWindow) {
    this.view.setBackgroundColor('#00000000')
    const wc = this.view.webContents
    wc.once('did-finish-load', () => {
      this.ready = true
      if (this.current) wc.send(OVERLAY_IPC.surface, this.current)
      if (this.notice) wc.send(OVERLAY_IPC.agentNotice, this.notice)
      if (this.drift) wc.send(OVERLAY_IPC.driftNotice, this.drift)
    })
    if (process.env.ELECTRON_RENDERER_URL) void wc.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
    else void wc.loadFile(join(__dirname, '../renderer/overlay.html'))
    wc.ipc.on(OVERLAY_IPC.noticeHeight, (_e, px: unknown) => {
      const h = typeof px === 'number' && Number.isFinite(px) ? Math.max(0, Math.ceil(px)) : 0
      if (h === this.noticeHeight) return
      this.noticeHeight = h
      if (this.notice && !this.current) this.layout()
    })
    window.on('resize', () => this.layout())
  }

  get webContents() {
    return this.view.webContents
  }

  get isVisible(): boolean {
    return this.current !== null || this.notice !== null || this.drift !== null
  }

  /** Show/update the agent switch notice; independent of any open surface. */
  showAgentNotice(notice: AgentSwitchNoticeState | null): void {
    if (!notice || notice.id !== this.notice?.id) this.noticeHeight = 0
    this.notice = notice
    // Re-layout on clear too: a queued drift notice (see notification
    // ordering in the overlay renderer) becomes visible next and needs
    // its own (smaller) bottom-center dock bounds.
    if (!notice && this.drift) this.layout()
    if (notice) {
      this.layout()
      if (!this.window.isDestroyed() && !this.window.contentView.children.includes(this.view)) {
        this.window.contentView.addChildView(this.view)
      } else {
        this.raise()
      }
    } else if (!this.current && !this.drift && !this.window.isDestroyed() && this.window.contentView.children.includes(this.view)) {
      this.window.contentView.removeChildView(this.view)
    }
    if (this.ready && !this.view.webContents.isDestroyed()) {
      this.view.webContents.send(OVERLAY_IPC.agentNotice, notice)
    }
  }

  /** Show/clear the small drift notice; independent of any open surface or agent notice. */
  showDriftNotice(notice: WorkspaceDriftNoticeState | null): void {
    this.drift = notice
    if (notice) {
      this.layout()
      if (!this.window.isDestroyed() && !this.window.contentView.children.includes(this.view)) {
        this.window.contentView.addChildView(this.view)
      } else {
        this.raise()
      }
    } else if (!this.current && !this.notice && !this.window.isDestroyed() && this.window.contentView.children.includes(this.view)) {
      this.window.contentView.removeChildView(this.view)
    }
    if (this.ready && !this.view.webContents.isDestroyed()) {
      this.view.webContents.send(OVERLAY_IPC.driftNotice, notice)
    }
  }

  show(req: SurfaceRequest): void {
    console.log('[overlay] show', req.kind, 'ready', this.ready, 'attached', this.window.contentView.children.includes(this.view))
    this.current = req
    this.layout()
    if (!this.window.contentView.children.includes(this.view)) {
      this.window.contentView.addChildView(this.view)
    } else {
      this.raise()
    }
    if (this.ready && !this.view.webContents.isDestroyed()) {
      this.view.webContents.send(OVERLAY_IPC.surface, req)
    }
    setTimeout(() => console.log('[overlay] state', {
      children: this.window.contentView.children.length,
      index: this.window.contentView.children.indexOf(this.view),
      bounds: this.view.getBounds(),
      visible: (this.view as unknown as { visible?: boolean }).visible
    }), 500)
    this.view.webContents.focus()
  }

  hide(): void {
    console.log('[overlay] hide', new Error().stack?.split('\n').slice(2,5).join(' | '))
    this.current = null
    if (!this.view.webContents.isDestroyed()) this.view.webContents.send(OVERLAY_IPC.surface, null)
    // The agent/drift notices keep the layer attached on their own.
    if (this.notice || this.drift) this.layout()
    if (!this.notice && !this.drift && !this.window.isDestroyed() && this.window.contentView.children.includes(this.view)) {
      this.window.contentView.removeChildView(this.view)
    }
    if (!this.window.isDestroyed()) this.window.webContents.focus()
  }

  /** Keep the overlay above page views that were (re)attached after it. */
  raise(): void {
    if ((!this.current && !this.notice && !this.drift) || this.window.isDestroyed()) return
    const children = this.window.contentView.children
    // Already on top: skip the detach/re-attach (it runs on every engine
    // snapshot and would otherwise churn the view and drop its focus).
    if (children[children.length - 1] === this.view) return
    if (children.includes(this.view)) {
      this.window.contentView.removeChildView(this.view)
      this.window.contentView.addChildView(this.view)
    }
  }

  private layout(): void {
    if (this.window.isDestroyed()) return
    const [width, height] = this.window.getContentSize()
    if (this.current) {
      this.view.setBounds({ x: 0, y: 0, width, height })
    } else if (this.notice) {
      // Notice-only: hug the rendered panel (+ its 12px bottom inset and
      // a little room for the glow) — this native layer swallows every
      // click inside its bounds, so any slack above the panel is a dead
      // zone over the page. Until the first measurement lands, assume a
      // compact running dock.
      const w = Math.min(496, width)
      const h = Math.min(this.noticeHeight > 0 ? this.noticeHeight + 24 : 140, 760, height)
      this.view.setBounds({ x: Math.max(0, Math.round((width - w) / 2)), y: Math.max(0, height - h), width: w, height: h })
    } else if (this.drift) {
      // Drift-only: same bottom-center dock as the agent notice, sized
      // for the 340px toast + its 12px inset so the rest of the window
      // stays clickable through the layer.
      const w = Math.min(364, width)
      const h = Math.min(120, height)
      this.view.setBounds({ x: Math.max(0, Math.round((width - w) / 2)), y: Math.max(0, height - h), width: w, height: h })
    } else {
      this.view.setBounds({ x: 0, y: 0, width, height })
    }
  }

  dispose(): void {
    this.hide()
    this.view.webContents.close()
  }
}
