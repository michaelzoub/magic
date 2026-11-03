/**
 * Embedded agent host: owns the agent's life inside the Electron app.
 *
 * - Starts a localhost tool bridge (see `tool-bridge.ts`) so the agent
 *   process can execute browser tools against the live engine.
 * - Starts the Eve server as a child process (Electron-as-Node, which is
 *   Node 24 and satisfies Eve's requirement), unless `EVE_AGENT_URL`
 *   points at a server the user runs themselves — that server must then
 *   have been started with the bridge env, which this host cannot set,
 *   so tools will report `unavailable` there.
 * - On each workspace switch, sends the before → after prompt built by
 *   `@agent/lib/switch` through the `AgentRuntime` seam. Runs are
 *   coalesced: rapid switches collapse into the latest notice.
 *
 * Everything fails soft: a missing Eve install, an unstartable server,
 * or a failed run returns `{ status: 'skipped' | 'failed', reason }`
 * and never blocks or breaks the workspace switch itself.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentRunResult, WorkspaceSwitchNotice } from '@shared/agent'
import { buildWorkspaceSwitchPrompt } from '@agent/lib/switch'
import { createAgentRuntime, type AgentRuntime } from '@agent/lib/runtime'
import type { ElectronEngine } from '../browser/electron-engine'
import { createElectronToolContext } from './browser-tools'
import { startToolBridge, type ToolBridge } from './tool-bridge'

const DEFAULT_EVE_PORT = 3217
/** Hard cap for one workspace-switch run; a run that exceeds it is cancelled. */
export const SWITCH_RUN_TIMEOUT_MS = 15_000

export interface EmbeddedAgentHostOptions {
  appRoot: string
  engine: ElectronEngine
  log?: (message: string) => void
  /** Test seams. */
  runtime?: AgentRuntime
  execPath?: string
  /** `none` skips starting/checking an Eve server (a runtime must be injected). */
  eveServer?: 'spawn' | 'none'
  /** Per-run timeout; defaults to SWITCH_RUN_TIMEOUT_MS (env MAGIC_AGENT_TIMEOUT_MS). */
  timeoutMs?: number
}

interface Waiter {
  resolve: (result: AgentRunResult) => void
}

export class EmbeddedAgentHost {
  private bridge: ToolBridge | null = null
  private child: ChildProcess | null = null
  private runtime: AgentRuntime | null = null
  private ready: Promise<AgentRunResult | null> | null = null
  private pending: { notice: WorkspaceSwitchNotice; waiters: Waiter[] } | null = null
  private running = false
  private disposed = false

  constructor(private opts: EmbeddedAgentHostOptions) {}

  private log(message: string): void {
    this.opts.log?.(`[agent] ${message}`)
  }

  /** Report a workspace switch. Coalesces bursts; never rejects. */
  workspaceSwitched(notice: WorkspaceSwitchNotice): Promise<AgentRunResult> {
    if (process.env.MAGIC_AGENT_ENABLED === '0') {
      return Promise.resolve({ status: 'skipped', reply: null, reason: 'MAGIC_AGENT_ENABLED=0' })
    }
    if (this.disposed) return Promise.resolve({ status: 'skipped', reply: null, reason: 'Agent host disposed' })
    return new Promise((resolve) => {
      if (this.pending) {
        // Newer switch supersedes the queued one; its waiters share the new run.
        this.pending.notice = notice
        this.pending.waiters.push({ resolve })
      } else {
        this.pending = { notice, waiters: [{ resolve }] }
      }
      void this.drain()
    })
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.pending && !this.disposed) {
        const { notice, waiters } = this.pending
        this.pending = null
        const result = await this.runOnce(notice)
        for (const w of waiters) w.resolve(result)
      }
    } finally {
      this.running = false
    }
  }

  private async runOnce(notice: WorkspaceSwitchNotice): Promise<AgentRunResult> {
    try {
      const setupError = await this.ensureReady()
      if (setupError) return setupError
      const timeoutMs = this.opts.timeoutMs ?? Number(process.env.MAGIC_AGENT_TIMEOUT_MS ?? SWITCH_RUN_TIMEOUT_MS)
      const result = await this.runtime!.send(buildWorkspaceSwitchPrompt(notice), {
        signal: AbortSignal.timeout(timeoutMs)
      })
      this.log(`workspace switch run (${notice.from?.name ?? '∅'} → ${notice.to.name}): ${result.status}`)
      return { status: result.status, reply: result.reply, runtime: this.runtime!.id }
    } catch (err) {
      // AbortSignal.timeout rejects with a TimeoutError DOMException.
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        const timeoutMs = this.opts.timeoutMs ?? Number(process.env.MAGIC_AGENT_TIMEOUT_MS ?? SWITCH_RUN_TIMEOUT_MS)
        this.log(`workspace switch run (${notice.from?.name ?? '∅'} → ${notice.to.name}): timed out after ${timeoutMs}ms`)
        return { status: 'failed', reply: null, runtime: this.runtime?.id, reason: `Agent run timed out after ${timeoutMs}ms` }
      }
      const message = err instanceof Error ? err.message : String(err)
      this.log(`workspace switch run failed: ${message}`)
      return { status: 'failed', reply: null, runtime: this.runtime?.id, reason: message }
    }
  }

  /** Lazily starts bridge + Eve server once; resolves to an error result on failure, null when ready. */
  private ensureReady(): Promise<AgentRunResult | null> {
    this.ready ??= this.setup().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      this.log(`setup failed: ${message}`)
      return { status: 'skipped', reply: null, reason: message } satisfies AgentRunResult
    })
    return this.ready
  }

  private async setup(): Promise<null> {
    this.bridge = await startToolBridge(() => createElectronToolContext(this.opts.engine))

    if (this.opts.eveServer === 'none') {
      if (!this.opts.runtime) throw new Error('eveServer: none requires an injected runtime')
      this.runtime = this.opts.runtime
      return null
    }

    const externalUrl = process.env.EVE_AGENT_URL
    const port = Number(process.env.EVE_PORT ?? DEFAULT_EVE_PORT)
    const baseUrl = externalUrl ?? `http://127.0.0.1:${port}`

    if (!externalUrl && !(await this.healthy(baseUrl))) {
      const eveBin = join(this.opts.appRoot, 'node_modules', 'eve', 'bin', 'eve.js')
      if (!existsSync(eveBin)) throw new Error(`Eve is not installed at ${eveBin}; run npm install`)
      this.log(`starting Eve server on port ${port}`)
      this.child = spawn(this.opts.execPath ?? process.execPath, [eveBin, 'dev', '--no-ui', '--port', String(port)], {
        cwd: this.opts.appRoot,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          MAGIC_TOOL_BRIDGE_URL: this.bridge.url,
          MAGIC_TOOL_BRIDGE_TOKEN: this.bridge.token
        },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.child.stdout?.on('data', (d: Buffer) => this.log(`eve: ${String(d).trim()}`))
      this.child.stderr?.on('data', (d: Buffer) => this.log(`eve: ${String(d).trim()}`))
      this.child.once('exit', (code) => this.log(`Eve server exited (code ${code})`))
      await this.waitHealthy(baseUrl, 90_000)
    }

    this.runtime = this.opts.runtime ?? createAgentRuntime({ baseUrl })
    this.log(`ready (runtime=${this.runtime.id}, eve=${baseUrl}, bridge=${this.bridge.url})`)
    return null
  }

  private async healthy(baseUrl: string): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/eve/v1/health`, { signal: AbortSignal.timeout(1_500) })
      const body = (await res.json().catch(() => null)) as { ok?: boolean } | null
      return res.ok && body?.ok === true
    } catch {
      return false
    }
  }

  private async waitHealthy(baseUrl: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.child?.exitCode !== null && this.child?.exitCode !== undefined) {
        throw new Error(`Eve server exited early (code ${this.child.exitCode})`)
      }
      if (await this.healthy(baseUrl)) return
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error(`Eve server did not become healthy within ${timeoutMs}ms`)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.child?.kill()
    this.child = null
    await this.bridge?.close().catch(() => {})
    this.bridge = null
  }
}
