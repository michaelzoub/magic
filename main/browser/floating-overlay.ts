import { BrowserWindow, WebContentsView } from 'electron'
import { join } from 'node:path'
import { OVERLAY_IPC, type SurfaceRequest } from '@shared/overlay'

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
  private ready = false

  constructor(private window: BrowserWindow) {
    this.view.setBackgroundColor('#00000000')
    const wc = this.view.webContents
    wc.once('did-finish-load', () => {
      this.ready = true
      if (this.current) wc.send(OVERLAY_IPC.surface, this.current)
    })
    if (process.env.ELECTRON_RENDERER_URL) void wc.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
    else void wc.loadFile(join(__dirname, '../renderer/overlay.html'))
    window.on('resize', () => this.layout())
  }

  get webContents() {
    return this.view.webContents
  }

  get isVisible(): boolean {
    return this.current !== null
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
    if (!this.window.isDestroyed() && this.window.contentView.children.includes(this.view)) {
      this.window.contentView.removeChildView(this.view)
    }
    if (!this.window.isDestroyed()) this.window.webContents.focus()
  }

  /** Keep the overlay above page views that were (re)attached after it. */
  raise(): void {
    if (!this.current || this.window.isDestroyed()) return
    if (this.window.contentView.children.includes(this.view)) {
      this.window.contentView.removeChildView(this.view)
      this.window.contentView.addChildView(this.view)
    }
  }

  private layout(): void {
    if (this.window.isDestroyed()) return
    const [width, height] = this.window.getContentSize()
    this.view.setBounds({ x: 0, y: 0, width, height })
  }

  dispose(): void {
    this.hide()
    this.view.webContents.close()
  }
}
