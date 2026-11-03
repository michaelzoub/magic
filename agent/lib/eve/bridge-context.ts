/**
 * `ToolContext` that proxies every browser/page call over HTTP to the
 * host process (Electron main), which owns the real browser engine.
 * Selected automatically when `MAGIC_TOOL_BRIDGE_URL` is set (the host
 * also sets `MAGIC_TOOL_BRIDGE_TOKEN`). The tool registry, guards, and
 * schemas all run locally as usual — only the port calls cross the wire.
 */
import type { BrowserEngine } from '@shared/engine'
import { ToolError, type ToolErrorCode } from '../tools/types'
import type { PageDriver, ToolContext } from '../tools/ports'

const ERROR_CODES: ReadonlySet<string> = new Set(['invalid_input', 'not_found', 'forbidden', 'unavailable', 'failed'])

export function createBridgeToolContext(baseUrl: string, token?: string): ToolContext {
  const call = async <T>(target: 'browser' | 'page', method: string, args: unknown[]): Promise<T> => {
    let res: Response
    try {
      res = await fetch(`${baseUrl.replace(/\/$/, '')}/call`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-magic-bridge-token': token } : {})
        },
        body: JSON.stringify({ target, method, args })
      })
    } catch (err) {
      throw new ToolError('unavailable', `Browser host bridge unreachable: ${err instanceof Error ? err.message : String(err)}`)
    }
    const body = (await res.json().catch(() => null)) as { result?: T; error?: { code?: string; message?: string } } | null
    if (!res.ok || body?.error) {
      const code = body?.error?.code
      throw new ToolError(
        code && ERROR_CODES.has(code) ? (code as ToolErrorCode) : 'failed',
        body?.error?.message ?? `Browser host bridge failed (HTTP ${res.status})`
      )
    }
    return body?.result as T
  }

  const browser = {
    getSnapshot: () => call('browser', 'getSnapshot', []),
    subscribe: () => () => {},
    createTab: (url?: string) => call('browser', 'createTab', [url]),
    closeTab: (id: string) => call('browser', 'closeTab', [id]),
    activateTab: (id: string) => call('browser', 'activateTab', [id]),
    moveTab: () => Promise.reject(new ToolError('forbidden', 'moveTab is not available to the agent')),
    switchWorkspace: () => Promise.reject(new ToolError('forbidden', 'switchWorkspace is not available to the agent')),
    navigate: (id: string, input: string) => call('browser', 'navigate', [id, input]),
    goBack: (id: string) => call('browser', 'goBack', [id]),
    goForward: (id: string) => call('browser', 'goForward', [id]),
    reload: (id: string) => call('browser', 'reload', [id]),
    stop: (id: string) => call('browser', 'stop', [id]),
    preconnect: () => {},
    setViewportBounds: () => {}
  } satisfies BrowserEngine

  const page: PageDriver = {
    getContent: (tabId, opts) => call('page', 'getContent', [tabId, opts]),
    query: (tabId, selector, opts) => call('page', 'query', [tabId, selector, opts]),
    click: (tabId, selector, index) => call('page', 'click', [tabId, selector, index]),
    type: (tabId, selector, index, text, opts) => call('page', 'type', [tabId, selector, index, text, opts])
  }

  // No `store`: BrowserStore is synchronous and lives with the renderer/
  // switchboard, so workspace-ownership tools report `unavailable` here.
  return { browser, page }
}
