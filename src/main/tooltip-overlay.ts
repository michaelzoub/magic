import { BrowserWindow, WebContentsView } from 'electron'
import type { TooltipRequest } from '@shared/overlay'

const GAP = { top: 6, bottom: 6, right: 8 }

// Mirrors the renderer's `surface` look so native tooltips match in-DOM ones.
const HTML = `<!doctype html><html><head><style>
html,body{margin:0;background:transparent;overflow:hidden}
#t{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border-radius:5px;padding:4px 8px;
background:#1e1e1e;color:#fff;font:500 11px/16px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;
box-shadow:0 0 0 .5px rgb(255 255 255/.06);opacity:0;transition:opacity 100ms ease-out}
#t.on{opacity:1}kbd{font:inherit;color:rgb(255 255 255/.45)}
</style></head><body><div id="t"></div></body></html>`

/** A tiny transparent view stacked above the page that shows one tooltip at a time. */
export class TooltipOverlay {
  private view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, javascript: true } })
  private seq = 0

  constructor(private window: BrowserWindow) {
    this.view.setBackgroundColor('#00000000')
    this.view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`)
  }

  async show({ label, shortcut, side, anchor }: TooltipRequest): Promise<void> {
    const seq = ++this.seq
    const wc = this.view.webContents
    if (wc.isDestroyed()) return
    const size: { width: number; height: number } = await wc.executeJavaScript(`(() => {
      const t = document.getElementById('t'); t.className = ''; t.textContent = ${JSON.stringify(label)}
      const s = ${JSON.stringify(shortcut ?? '')}
      if (s) { const k = document.createElement('kbd'); k.textContent = s; t.append(k) }
      const r = t.getBoundingClientRect(); return { width: Math.ceil(r.width), height: Math.ceil(r.height) }
    })()`)
    if (seq !== this.seq || this.window.isDestroyed()) return

    const cx = anchor.x + anchor.width / 2
    const cy = anchor.y + anchor.height / 2
    const pos =
      side === 'right' ? { x: anchor.x + anchor.width + GAP.right, y: cy - size.height / 2 }
      : side === 'top' ? { x: cx - size.width / 2, y: anchor.y - GAP.top - size.height }
      : { x: cx - size.width / 2, y: anchor.y + anchor.height + GAP.bottom }
    const [winW] = this.window.getContentSize()
    const x = Math.max(4, Math.min(Math.round(pos.x), winW - size.width - 4))

    this.view.setBounds({ x, y: Math.round(pos.y), width: size.width, height: size.height })
    // Re-adding moves it to the top of the stack, above any newly attached page view.
    this.window.contentView.addChildView(this.view)
    void wc.executeJavaScript(`document.getElementById('t').className = 'on'`)
  }

  hide(): void {
    this.seq++
    if (!this.window.isDestroyed() && this.window.contentView.children.includes(this.view)) {
      this.window.contentView.removeChildView(this.view)
    }
  }

  dispose(): void {
    this.hide()
    this.view.webContents.close()
  }
}
