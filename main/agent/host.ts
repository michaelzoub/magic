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
 * Packaged builds pass `eveBundle` instead: the production Eve server
 * built by `eve build` (see `scripts/build-agent.mjs`), run from the app's
 * resources with its state in the user's app-data folder. Either way the
 * server only accepts requests carrying a per-launch secret
 * (`agent/channels/eve.ts`).
 *
 * Everything fails soft: a missing Eve install, an unstartable server,
 * or a failed run returns `{ status: 'skipped' | 'failed', reason }`
 * and never blocks or breaks the workspace switch itself.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import {
  canAssistanceRestructure,
  DEFAULT_ASSISTANCE,
  isSiteExcluded,
  type AgentChatContext,
  type DriftAssessmentRequest,
  type DriftAssessmentResult,
  type AgentStreamEvent,
  type AgentStreamListener,
  type AgentRunResult,
  type AgentTabProposal,
  type AssistanceActivity,
  type AssistanceSettings,
  type WorkspaceSwitchNotice
} from '@shared/agent'
import { buildAgentChatPrompt } from '@agent/lib/chat'
import { buildDriftPrompt, extractDriftVerdicts } from '@agent/lib/drift'
import { createInferenceClient, type InferenceClient } from '@agent/lib/inference'
import { agentModelProvider } from '@agent/lib/model'
import { buildWorkspaceSwitchPrompt } from '@agent/lib/switch'
import { extractCheckpointVerdict } from '@agent/lib/verdict'
import { createAgentRuntime, type AgentRuntime } from '@agent/lib/runtime'
import type { ElectronEngine } from '../browser/electron-engine'
import type { WorkspaceDirectory } from '@agent/lib/tools/ports'
import { createElectronToolContext } from './browser-tools'
import { createStagedToolContext } from './staged-context'
import { startToolBridge, type ToolBridge } from './tool-bridge'

const DEFAULT_EVE_PORT = 3217

/** Shown in the chat when no key is set; Settings is the gear at the bottom of the sidebar. */
export const MISSING_KEY_REASON = 'add your Meta Model API key in Settings to turn on the agent.'

/** The default provider needs `MODEL_API_KEY`; the AI Gateway path authenticates on its own. */
function missingModelKey(): boolean {
  return agentModelProvider() === 'meta' && !process.env.MODEL_API_KEY?.trim()
}
/**
 * Hard cap for one workspace-switch run; a run that exceeds it is cancelled.
 * Sized from Eve traces: one model step averages ~2.8s (tool calls are
 * negligible next to it) and a healthy switch run takes 4–6 steps, i.e.
 * 11–17s — the old 15s cap aborted runs that were progressing fine.
 */
export const SWITCH_RUN_TIMEOUT_MS = 60_000
/** Hard cap for one chat turn; tool-driven tasks need longer than a switch run. */
export const CHAT_RUN_TIMEOUT_MS = 120_000
/** Hard cap for one goal-drift judgment; it is a single bare inference call. */
export const DRIFT_RUN_TIMEOUT_MS = 8_000

export interface EmbeddedAgentHostOptions {
  appRoot: string
  engine: ElectronEngine
  log?: (message: string) => void
  /** Test seams. */
  runtime?: AgentRuntime
  execPath?: string
  /** `none` skips starting/checking an Eve server (a runtime must be injected). */
  eveServer?: 'spawn' | 'none'
  /**
   * Run the prebuilt production Eve server instead of `eve dev` (packaged
   * builds): `serverEntry` is its `server/index.mjs`, `stateDir` a writable
   * directory for its runtime state.
   */
  eveBundle?: { serverEntry: string; stateDir: string }
  /** Per-run timeout; defaults to SWITCH_RUN_TIMEOUT_MS (env MAGIC_AGENT_TIMEOUT_MS). */
  timeoutMs?: number
  /** Per-chat-turn timeout; defaults to CHAT_RUN_TIMEOUT_MS (env MAGIC_AGENT_CHAT_TIMEOUT_MS). */
  chatTimeoutMs?: number
  /** Per-drift-judgment timeout; defaults to DRIFT_RUN_TIMEOUT_MS (env MAGIC_AGENT_DRIFT_TIMEOUT_MS). */
  driftTimeoutMs?: number
  /** Bare-inference client for drift judgment; defaults to a direct model call (never the Eve agent). */
  inference?: InferenceClient
  /** Initial global background-assistance state (e.g. loaded from persisted settings). */
  assistance?: AssistanceSettings
  /** Shared global assistance state; defaults to the process-wide singleton. */
  assistanceState?: BackgroundAssistance
  /** Workspace list/switch for chat turns (the store lives in the renderer). */
  workspaces?: WorkspaceDirectory
  /** Awaited before an agent tool call closes a tab, so the shell can highlight it first. */
  onTabClosing?: (tabId: string) => Promise<void> | void
}

/**
 * The one global background-assistance state for the app. Shared by every
 * host (window) in the process, so the toggle is global, and consulted
 * before any restructuring run: off, or an excluded workspace, means the
 * agent cannot touch anything. Ordinary session restoration in the shell
 * never goes through this state.
 */
export class BackgroundAssistance {
  private settings: AssistanceSettings
  private activity: AssistanceActivity[] = []

  constructor(initial: AssistanceSettings = DEFAULT_ASSISTANCE, private onChange?: (settings: AssistanceSettings) => void) {
    this.settings = {
      active: initial.active,
      excludedSites: [...initial.excludedSites],
      excludedWorkspaceIds: [...initial.excludedWorkspaceIds]
    }
  }

  get(): AssistanceSettings {
    return {
      active: this.settings.active,
      excludedSites: [...this.settings.excludedSites],
      excludedWorkspaceIds: [...this.settings.excludedWorkspaceIds]
    }
  }

  setActive(active: boolean): AssistanceSettings {
    this.settings = { ...this.settings, active }
    this.onChange?.(this.get())
    return this.get()
  }

  setExclusions(excludedSites: string[], excludedWorkspaceIds: string[]): AssistanceSettings {
    this.settings = { ...this.settings, excludedSites: [...new Set(excludedSites)], excludedWorkspaceIds: [...new Set(excludedWorkspaceIds)] }
    this.onChange?.(this.get())
    return this.get()
  }

  /** Whether a restructuring run may target `workspaceId` right now. */
  canRestructure(workspaceId: string | null | undefined): boolean {
    return canAssistanceRestructure(this.settings, workspaceId)
  }

  /** A copy of `notice` with excluded sites' tabs removed, so the agent never sees them. */
  filterNotice(notice: WorkspaceSwitchNotice): WorkspaceSwitchNotice {
    const { excludedSites } = this.settings
    if (excludedSites.length === 0) return notice
    return {
      ...notice,
      outgoingTabs: notice.outgoingTabs.filter((t) => !isSiteExcluded(t.url, excludedSites)),
      incomingTabs: notice.incomingTabs.filter((t) => !isSiteExcluded(t.url, excludedSites))
    }
  }

  record(description: string, status: AssistanceActivity['status']): void {
    this.activity.unshift({ id: crypto.randomUUID(), at: Date.now(), description, status })
    this.activity = this.activity.slice(0, 50)
  }

  listActivity(limit = 10): AssistanceActivity[] {
    return this.activity.slice(0, Math.max(0, limit))
  }
}

interface Waiter {
  resolve: (result: AgentRunResult) => void
  onEvent?: AgentStreamListener
}

/**
 * A loopback port Eve can bind: `preferred` when free, otherwise an
 * ephemeral one. Probing by binding (then releasing) is what keeps a
 * stale Eve listener from ever being handed our bridge env's port.
 */
export function findFreePort(preferred?: number): Promise<number> {
  const tryBind = (port: number) =>
    new Promise<number | null>((resolve) => {
      const probe = createServer()
      probe.once('error', () => resolve(null))
      probe.listen(port, '127.0.0.1', () => {
        const address = probe.address()
        const bound = address && typeof address !== 'string' ? address.port : null
        probe.close(() => resolve(bound))
      })
    })
  return (async () => {
    if (preferred) {
      const port = await tryBind(preferred)
      if (port !== null) return port
    }
    const port = await tryBind(0)
    if (port === null) throw new Error('Could not allocate a port for the Eve server')
    return port
  })()
}

/** Process-wide assistance state, so every window's host sees the same toggle. */
const sharedAssistance = new BackgroundAssistance()

export class EmbeddedAgentHost {
  private bridge: ToolBridge | null = null
  private child: ChildProcess | null = null
  private runtime: AgentRuntime | null = null
  /** Lazily created bare-inference client for drift judgment; never an Eve runtime. */
  private inference: InferenceClient | null = null
  private ready: Promise<AgentRunResult | null> | null = null
  private pending: { notice: WorkspaceSwitchNotice; waiters: Waiter[] } | null = null
  /** Proposals being staged by the in-flight switch run; null outside one. */
  private staging: AgentTabProposal[] | null = null
  private running = false
  private disposed = false
  /** Conversation session for chatbox turns; follow-ups continue it. */
  private chatSessionId: string | undefined
  /** Serializes chat turns so one session never has two turns in flight. */
  private chatQueue: Promise<unknown> = Promise.resolve()
  /** Global background-assistance state (shared across windows by default). */
  readonly assistance: BackgroundAssistance

  constructor(private opts: EmbeddedAgentHostOptions) {
    this.assistance = opts.assistanceState ?? (opts.assistance ? new BackgroundAssistance(opts.assistance) : sharedAssistance)
  }

  getAssistance(): AssistanceSettings {
    return this.assistance.get()
  }

  setAssistanceActive(active: boolean): AssistanceSettings {
    const next = this.assistance.setActive(active)
    this.log(`background assistance ${active ? 'on' : 'off'}`)
    return next
  }

  setAssistanceExclusions(excludedSites: string[], excludedWorkspaceIds: string[]): AssistanceSettings {
    return this.assistance.setExclusions(excludedSites, excludedWorkspaceIds)
  }

  listAssistanceActivity(limit = 10): AssistanceActivity[] {
    return this.assistance.listActivity(limit)
  }

  private log(message: string): void {
    this.opts.log?.(`[agent] ${message}`)
  }

  /** Report a workspace switch. Coalesces bursts; never rejects. */
  workspaceSwitched(notice: WorkspaceSwitchNotice, onEvent?: AgentStreamListener): Promise<AgentRunResult> {
    // Background-assistance gate: off (or an excluded workspace) means the
    // agent cannot restructure anything. The switch itself — and ordinary
    // session restoration, which never calls this — is unaffected.
    if (!this.assistance.get().active) {
      this.assistance.record(`${notice.from?.name ?? '∅'} → ${notice.to.name}: background assistance off`, 'skipped')
      return Promise.resolve({ status: 'skipped', reply: null, reason: 'Background assistance is off' })
    }
    if (!this.assistance.canRestructure(notice.to.id)) {
      this.assistance.record(`${notice.from?.name ?? '∅'} → ${notice.to.name}: workspace excluded`, 'skipped')
      return Promise.resolve({ status: 'skipped', reply: null, reason: `Workspace “${notice.to.name}” is excluded from background assistance` })
    }
    notice = this.assistance.filterNotice(notice)
    if (process.env.MAGIC_AGENT_ENABLED === '0') {
      return Promise.resolve({ status: 'skipped', reply: null, reason: 'MAGIC_AGENT_ENABLED=0' })
    }
    if (this.disposed) return Promise.resolve({ status: 'skipped', reply: null, reason: 'Agent host disposed' })
    return new Promise((resolve) => {
      if (this.pending) {
        // Newer switch supersedes the queued one; its waiters share the new run.
        this.pending.notice = notice
        this.pending.waiters.push({ resolve, onEvent })
      } else {
        this.pending = { notice, waiters: [{ resolve, onEvent }] }
      }
      void this.drain()
    })
  }

  /**
   * Ask the agent a chatbox question. Explicit user requests are not gated
   * by background assistance (that toggle only stops unsolicited
   * restructuring), but excluded sites are stripped from the context.
   * Turns are serialized and continue one session. Never rejects.
   */
  ask(question: string, context: AgentChatContext, onEvent?: (event: AgentStreamEvent) => void): Promise<AgentRunResult> {
    const text = question.trim()
    if (!text) return Promise.resolve({ status: 'skipped', reply: null, reason: 'Empty question' })
    if (process.env.MAGIC_AGENT_ENABLED === '0') {
      return Promise.resolve({ status: 'skipped', reply: null, reason: 'MAGIC_AGENT_ENABLED=0' })
    }
    if (this.disposed) return Promise.resolve({ status: 'skipped', reply: null, reason: 'Agent host disposed' })
    const { excludedSites } = this.assistance.get()
    const visible: AgentChatContext = {
      workspace: context.workspace,
      tabs: context.tabs.filter((t) => !isSiteExcluded(t.url, excludedSites))
    }
    const run = this.chatQueue.then(() => this.askOnce(text, visible, onEvent))
    this.chatQueue = run.catch(() => {})
    return run
  }

  /**
   * Judge whether tabs are unrelated to the active workspace's goal.
   * Deliberately NOT an agent run: one bare inference call and back
   * (`@agent/lib/inference`) — no Eve server, session, tools, or thinking,
   * so feedback lands in about a second. Gated like restructuring (off /
   * excluded workspace / excluded site means the model never sees the
   * tab), but it only judges, it never restructures. Fails soft: no reply
   * or no verdicts yields `unknown`, never drift. Never rejects.
   */
  async assessDrift(request: DriftAssessmentRequest): Promise<DriftAssessmentResult> {
    const skipped = (reason: string): DriftAssessmentResult => ({ status: 'skipped', verdicts: [], reason })
    if (!request.workspace || request.tabs.length === 0) return skipped('Nothing to judge')
    if (!this.assistance.get().active) return skipped('Background assistance is off')
    if (!this.assistance.canRestructure(request.workspace.id)) return skipped(`Workspace “${request.workspace.name}” is excluded from background assistance`)
    if (process.env.MAGIC_AGENT_ENABLED === '0') return skipped('MAGIC_AGENT_ENABLED=0')
    if (this.disposed) return skipped('Agent host disposed')
    const { excludedSites } = this.assistance.get()
    const tabs = request.tabs.filter((t) => !isSiteExcluded(t.url, excludedSites))
    if (tabs.length === 0) return skipped('All tabs are on excluded sites')
    if (!this.opts.inference && missingModelKey()) return skipped(MISSING_KEY_REASON)
    const inference = this.opts.inference ?? (this.inference ??= createInferenceClient())
    const timeoutMs = this.opts.driftTimeoutMs ?? Number(process.env.MAGIC_AGENT_DRIFT_TIMEOUT_MS ?? DRIFT_RUN_TIMEOUT_MS)
    try {
      const reply = await inference.complete(buildDriftPrompt({ workspace: request.workspace, tabs }), {
        signal: AbortSignal.timeout(timeoutMs)
      })
      const verdicts = extractDriftVerdicts(reply, tabs.map((t) => t.id))
      this.log(`drift judgment for “${request.workspace.name}”: ${verdicts.length}/${tabs.length} judged`)
      return { status: 'completed', verdicts, runtime: inference.id }
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        this.log(`drift judgment timed out after ${timeoutMs}ms`)
        return { status: 'failed', verdicts: [], runtime: inference.id, reason: `Inference timed out after ${timeoutMs}ms` }
      }
      const message = err instanceof Error ? err.message : String(err)
      this.log(`drift judgment failed: ${message}`)
      return { status: 'failed', verdicts: [], runtime: inference.id, reason: message }
    }
  }

  private async askOnce(
    question: string,
    context: AgentChatContext,
    onEvent?: (event: AgentStreamEvent) => void
  ): Promise<AgentRunResult> {
    try {
      const setupError = await this.ensureReady()
      if (setupError) return setupError
      const timeoutMs = this.opts.chatTimeoutMs ?? Number(process.env.MAGIC_AGENT_CHAT_TIMEOUT_MS ?? CHAT_RUN_TIMEOUT_MS)
      const prompt = buildAgentChatPrompt(question, context)
      const turnOpts = { sessionId: this.chatSessionId, signal: AbortSignal.timeout(timeoutMs) }
      // Stream when the runtime supports it (live text + tool calls in the
      // chatbox); otherwise the final reply simply arrives at the end.
      const result =
        onEvent && this.runtime!.sendStream
          ? await this.runtime!.sendStream(prompt, { ...turnOpts, onEvent })
          : await this.runtime!.send(prompt, turnOpts)
      this.chatSessionId = result.sessionId
      this.log(`chat run: ${result.status}`)
      this.assistance.record(`Chat: ${question.slice(0, 80)}`, result.status)
      const { reply, verdict } = extractCheckpointVerdict(result.reply)
      return { status: result.status, reply, runtime: this.runtime!.id, sessionId: result.sessionId, checkpointVerdict: verdict }
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        const timeoutMs = this.opts.chatTimeoutMs ?? Number(process.env.MAGIC_AGENT_CHAT_TIMEOUT_MS ?? CHAT_RUN_TIMEOUT_MS)
        this.log(`chat run timed out after ${timeoutMs}ms`)
        return { status: 'failed', reply: null, runtime: this.runtime?.id, reason: `Agent run timed out after ${timeoutMs}ms` }
      }
      const message = err instanceof Error ? err.message : String(err)
      this.log(`chat run failed: ${message}`)
      return { status: 'failed', reply: null, runtime: this.runtime?.id, reason: message }
    }
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.pending && !this.disposed) {
        const { notice, waiters } = this.pending
        this.pending = null
        const emit = (event: AgentStreamEvent) => {
          for (const w of waiters) {
            try {
              w.onEvent?.(event)
            } catch {
              // A broken listener must not break the run.
            }
          }
        }
        const result = await this.runOnce(notice, emit)
        this.assistance.record(`${notice.from?.name ?? '∅'} → ${notice.to.name}`, result.status)
        for (const w of waiters) w.resolve(result)
      }
    } finally {
      this.running = false
    }
  }

  private async runOnce(notice: WorkspaceSwitchNotice, emit?: AgentStreamListener): Promise<AgentRunResult> {
    // Stage every mutating tool call this run makes: the agent plans its
    // tab changes, the user approves them, and only then are they enacted.
    const proposals: AgentTabProposal[] = []
    this.staging = proposals
    try {
      const setupError = await this.ensureReady()
      if (setupError) return { ...setupError, proposals }
      const timeoutMs = this.opts.timeoutMs ?? Number(process.env.MAGIC_AGENT_TIMEOUT_MS ?? SWITCH_RUN_TIMEOUT_MS)
      const prompt = buildWorkspaceSwitchPrompt(notice)
      const turnOpts = { signal: AbortSignal.timeout(timeoutMs) }
      const result =
        emit && this.runtime!.sendStream
          ? await this.runtime!.sendStream(prompt, { ...turnOpts, onEvent: emit })
          : await this.runtime!.send(prompt, turnOpts)
      this.log(`workspace switch run (${notice.from?.name ?? '∅'} → ${notice.to.name}): ${result.status}`)
      const { reply, verdict } = extractCheckpointVerdict(result.reply)
      return { status: result.status, reply, runtime: this.runtime!.id, proposals, checkpointVerdict: verdict }
    } catch (err) {
      // AbortSignal.timeout rejects with a TimeoutError DOMException.
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        const timeoutMs = this.opts.timeoutMs ?? Number(process.env.MAGIC_AGENT_TIMEOUT_MS ?? SWITCH_RUN_TIMEOUT_MS)
        this.log(`workspace switch run (${notice.from?.name ?? '∅'} → ${notice.to.name}): timed out after ${timeoutMs}ms`)
        return { status: 'failed', reply: null, runtime: this.runtime?.id, reason: `Agent run timed out after ${timeoutMs}ms`, proposals }
      }
      const message = err instanceof Error ? err.message : String(err)
      this.log(`workspace switch run failed: ${message}`)
      return { status: 'failed', reply: null, runtime: this.runtime?.id, reason: message, proposals }
    } finally {
      if (this.staging === proposals) this.staging = null
    }
  }

  /** Lazily starts bridge + Eve server once; resolves to an error result on failure, null when ready. */
  private ensureReady(): Promise<AgentRunResult | null> {
    if (!this.opts.runtime && missingModelKey()) return Promise.resolve({ status: 'skipped', reply: null, reason: MISSING_KEY_REASON })
    if (!this.ready) {
      const ready = this.setup().catch(async (err: unknown) => {
        // Tear down the half-started bridge/Eve so a retry starts clean.
        this.child?.kill()
        this.child = null
        await this.bridge?.close().catch(() => {})
        this.bridge = null
        const message = err instanceof Error ? err.message : String(err)
        this.log(`setup failed: ${message}`)
        return { status: 'skipped', reply: null, reason: message } satisfies AgentRunResult
      })
      this.ready = ready
      // Never cache a failed setup: the next run must retry (e.g. Eve now
      // installed, or a transient spawn failure), not replay the failure.
      void ready.then((result) => {
        if (result && this.ready === ready) this.ready = null
      })
    }
    return this.ready
  }

  private async setup(): Promise<null> {
    this.bridge = await startToolBridge(() => {
      // During a switch run, hand the agent a staging context so its tab
      // changes become proposals instead of immediate mutations — and no
      // workspace switching mid-switch.
      if (this.staging) return createStagedToolContext(createElectronToolContext(this.opts.engine), this.staging)
      return createElectronToolContext(this.opts.engine, { workspaces: this.opts.workspaces, onTabClosing: this.opts.onTabClosing })
    })

    if (this.opts.eveServer === 'none') {
      if (!this.opts.runtime) throw new Error('eveServer: none requires an injected runtime')
      this.runtime = this.opts.runtime
      return null
    }

    const externalUrl = process.env.EVE_AGENT_URL
    if (externalUrl) {
      // User-managed server: reuse it as-is. This host cannot set its env,
      // so it must have been started with the bridge env itself (see header).
      this.runtime = this.opts.runtime ?? createAgentRuntime({ baseUrl: externalUrl })
      this.log(`ready (runtime=${this.runtime.id}, eve=${externalUrl}, bridge=${this.bridge.url})`)
      return null
    }

    // Never reuse a server already listening on the Eve port. Its bridge
    // env (MAGIC_TOOL_BRIDGE_URL/TOKEN) was baked in at *its* spawn time
    // and points at the ephemeral bridge of whichever host launched it —
    // once that host's window closed, its bridge closed with it, so the
    // orphaned server stays healthy while every tool call fails with
    // "Browser host bridge unreachable". Spawn our own Eve on a free port
    // instead, wired to *this* host's live bridge.
    const port = await findFreePort(Number(process.env.EVE_PORT ?? DEFAULT_EVE_PORT))
    const baseUrl = `http://127.0.0.1:${port}`
    const token = randomBytes(24).toString('base64url')
    const bundle = this.opts.eveBundle
    let args: string[]
    let cwd: string
    if (bundle) {
      if (!existsSync(bundle.serverEntry)) throw new Error(`Agent server is missing at ${bundle.serverEntry}`)
      mkdirSync(bundle.stateDir, { recursive: true })
      args = [bundle.serverEntry]
      cwd = bundle.stateDir
    } else {
      const eveBin = join(this.opts.appRoot, 'node_modules', 'eve', 'bin', 'eve.js')
      if (!existsSync(eveBin)) throw new Error(`Eve is not installed at ${eveBin}; run npm install`)
      args = [eveBin, 'dev', '--no-ui', '--port', String(port)]
      cwd = this.opts.appRoot
    }
    this.log(`starting Eve server (${bundle ? 'bundled' : 'dev'}) on port ${port}`)
    const child = spawn(this.opts.execPath ?? process.execPath, args, {
      cwd,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        // Read by the bundled server; `eve dev` takes --port instead.
        HOST: '127.0.0.1',
        PORT: String(port),
        EVE_SCHEDULES_DISABLED: '1',
        MAGIC_EVE_TOKEN: token,
        MAGIC_TOOL_BRIDGE_URL: this.bridge.url,
        MAGIC_TOOL_BRIDGE_TOKEN: this.bridge.token
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.child = child
    child.stdout?.on('data', (d: Buffer) => this.log(`eve: ${String(d).trim()}`))
    child.stderr?.on('data', (d: Buffer) => this.log(`eve: ${String(d).trim()}`))
    child.once('exit', (code) => {
      this.log(`Eve server exited (code ${code})`)
      // A dead Eve must not poison later runs: drop the cached setup so
      // the next run respawns Eve against this host's (still live) bridge.
      if (this.child === child) {
        this.child = null
        this.runtime = null
        this.ready = null
      }
    })
    await this.waitHealthy(baseUrl, 90_000)

    this.runtime = this.opts.runtime ?? createAgentRuntime({ baseUrl, token })
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

  /**
   * Drop the running Eve server and cached model clients so the next run
   * starts fresh — called after the model API key changes, since both
   * read it once at startup.
   */
  async restart(): Promise<void> {
    this.log('restarting agent (model settings changed)')
    this.child?.kill()
    this.child = null
    this.runtime = null
    this.ready = null
    this.inference = null
    this.chatSessionId = undefined
    await this.bridge?.close().catch(() => {})
    this.bridge = null
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.child?.kill()
    this.child = null
    await this.bridge?.close().catch(() => {})
    this.bridge = null
  }
}
