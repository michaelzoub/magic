/**
 * Localhost HTTP bridge that lets the Eve server process execute browser
 * tools against this window's real engine. Eve-side counterpart:
 * `agent/lib/eve/bridge-context.ts`. Binds 127.0.0.1 on an ephemeral
 * port and requires a per-launch random token; never exposed beyond the
 * loopback interface.
 */
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { ToolContext } from '@agent/lib/tools'
import { ToolError } from '@agent/lib/tools/types'

const BROWSER_METHODS: ReadonlySet<string> = new Set([
  'getSnapshot', 'createTab', 'closeTab', 'activateTab', 'navigate', 'goBack', 'goForward', 'reload', 'stop'
])
const PAGE_METHODS: ReadonlySet<string> = new Set(['getContent', 'query', 'click', 'type'])
const WORKSPACE_METHODS: ReadonlySet<string> = new Set(['list', 'switchTo'])

export interface ToolBridge {
  url: string
  token: string
  close(): Promise<void>
}

/** Dispatches one bridged call against a ToolContext. Exported for tests. */
export async function dispatchBridgeCall(
  ctx: ToolContext,
  target: string,
  method: string,
  args: unknown[]
): Promise<unknown> {
  const allowed =
    target === 'browser' ? BROWSER_METHODS : target === 'page' ? PAGE_METHODS : target === 'workspaces' ? WORKSPACE_METHODS : null
  if (!allowed?.has(method)) throw new ToolError('forbidden', `Tool bridge does not allow ${target}.${method}`)
  if (target === 'workspaces' && !ctx.workspaces) throw new ToolError('unavailable', 'Workspaces are not available')
  const port = (target === 'browser' ? ctx.browser : target === 'page' ? ctx.page : ctx.workspaces) as unknown as Record<
    string,
    (...a: unknown[]) => unknown
  >
  return port[method](...args)
}

export function startToolBridge(getContext: () => ToolContext): Promise<ToolBridge> {
  const token = randomUUID()
  const server: Server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST' || req.url !== '/call') return send(404, { error: { code: 'not_found', message: 'Not found' } })
    if (req.headers['x-magic-bridge-token'] !== token) return send(401, { error: { code: 'forbidden', message: 'Bad bridge token' } })

    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      void (async () => {
        try {
          const { target, method, args } = JSON.parse(raw) as { target: string; method: string; args?: unknown[] }
          const result = await dispatchBridgeCall(getContext(), target, method, Array.isArray(args) ? args : [])
          send(200, { result: result ?? null })
        } catch (err) {
          if (err instanceof ToolError) return send(200, { error: { code: err.code, message: err.message } })
          send(200, { error: { code: 'failed', message: err instanceof Error ? err.message : String(err) } })
        }
      })()
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('Tool bridge failed to bind'))
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        token,
        close: () => new Promise<void>((done) => server.close(() => done()))
      })
    })
  })
}
