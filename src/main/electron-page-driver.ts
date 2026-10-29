import type { WebContents } from 'electron'
import type { TabId } from '@shared/engine'
import type { PageContent, PageDriver, PageElement } from '../core/tools/ports'
import { ToolError } from '../core/tools/types'

const ATTRS = ['id', 'name', 'type', 'href', 'value', 'placeholder', 'aria-label', 'role', 'title', 'alt']

/** Runs `fn(...args)` in the page's isolated world. `fn` must be self-contained. */
function run<T>(wc: WebContents, fn: (...args: any[]) => T, ...args: unknown[]): Promise<T> {
  const code = `(${fn.toString()})(...${JSON.stringify(args)})`
  return wc.executeJavaScriptInIsolatedWorld(999, [{ code }], true) as Promise<T>
}

/** Finds the target element in-page; throws a message the driver maps to `not_found`. */
function focusTarget(selector: string, index: number, clear: boolean): void {
  const el = document.querySelectorAll(selector)[index] as HTMLElement | undefined
  if (!el) throw new Error(`NOT_FOUND: no element #${index} for ${selector}`)
  el.scrollIntoView({ block: 'center' })
  el.focus()
  if (clear) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select()
    else if (el.isContentEditable) document.getSelection()?.selectAllChildren(el)
  }
}

/** PageDriver backed by Electron WebContents. */
export class ElectronPageDriver implements PageDriver {
  constructor(private webContentsFor: (id: TabId) => WebContents | null) {}

  async getContent(tabId: TabId, { maxLength }: { maxLength: number }): Promise<PageContent> {
    const wc = this.wc(tabId)
    const text = await this.call(() => run(wc, () => document.body?.innerText ?? ''))
    return { url: wc.getURL(), title: wc.getTitle(), text: text.slice(0, maxLength), truncated: text.length > maxLength }
  }

  async query(tabId: TabId, selector: string, { limit }: { limit: number }): Promise<PageElement[]> {
    return this.call(() =>
      run(this.wc(tabId), (sel: string, max: number, attrs: string[]) =>
        Array.from(document.querySelectorAll(sel)).slice(0, max).map((el, index) => {
          const rect = el.getBoundingClientRect()
          const attributes: Record<string, string> = {}
          for (const a of attrs) {
            const v = a === 'value' ? (el as HTMLInputElement).value : el.getAttribute(a)
            if (v) attributes[a] = String(v).slice(0, 200)
          }
          return {
            index,
            tag: el.tagName.toLowerCase(),
            text: ((el as HTMLElement).innerText ?? el.textContent ?? '').trim().slice(0, 300),
            attributes,
            visible: rect.width > 0 && rect.height > 0
          }
        }), selector, limit, ATTRS)
    )
  }

  async click(tabId: TabId, selector: string, index: number): Promise<void> {
    await this.call(() =>
      run(this.wc(tabId), (sel: string, i: number) => {
        const el = document.querySelectorAll(sel)[i] as HTMLElement | undefined
        if (!el) throw new Error(`NOT_FOUND: no element #${i} for ${sel}`)
        el.scrollIntoView({ block: 'center' })
        el.click()
      }, selector, index)
    )
  }

  async type(tabId: TabId, selector: string, index: number, text: string, opts: { clear: boolean; submit: boolean }): Promise<void> {
    const wc = this.wc(tabId)
    await this.call(() => run(wc, focusTarget, selector, index, opts.clear))
    // insertText goes through Chromium's input pipeline, so frameworks see real input events.
    if (opts.clear) wc.delete()
    await wc.insertText(text)
    if (opts.submit) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
      wc.sendInputEvent({ type: 'char', keyCode: '\r' })
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
    }
  }

  private wc(tabId: TabId): WebContents {
    const wc = this.webContentsFor(tabId)
    if (!wc || wc.isDestroyed()) throw new ToolError('unavailable', `Tab ${tabId} has no loaded page`)
    return wc
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof ToolError) throw err
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('NOT_FOUND:')) throw new ToolError('not_found', message.split('NOT_FOUND: ')[1])
      if (/SyntaxError|not a valid selector/i.test(message)) throw new ToolError('invalid_input', `Invalid selector: ${message}`)
      throw new ToolError('failed', message)
    }
  }
}
