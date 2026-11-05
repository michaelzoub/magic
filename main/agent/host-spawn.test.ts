import { createServer, type Server } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentRuntime } from '@agent/lib/runtime'
import type { ElectronEngine } from '../browser/electron-engine'
import { EmbeddedAgentHost, findFreePort, MISSING_KEY_REASON } from './host'

/** Minimal Eve stand-in: records the bridge env it was spawned with, then serves health. */
const FAKE_EVE = `
const { createServer } = require('node:http')
const { writeFileSync } = require('node:fs')
const port = Number(process.argv[process.argv.indexOf('--port') + 1])
writeFileSync(process.env.MAGIC_FAKE_EVE_RECORD, JSON.stringify({
  port,
  bridgeUrl: process.env.MAGIC_TOOL_BRIDGE_URL,
  bridgeToken: process.env.MAGIC_TOOL_BRIDGE_TOKEN
}))
createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
}).listen(port, '127.0.0.1')
`

const runtime: AgentRuntime = {
  id: 'fake',
  send: async () => ({ sessionId: 's1', reply: 'done', status: 'completed' as const })
}

function fakeEngine() {
  return {
    getSnapshot: vi.fn(async () => ({ tabs: [{ id: 't1', url: 'https://example.com', title: 'Example' }], activeTabId: 't1' })),
    webContentsFor: () => undefined
  } as unknown as ElectronEngine
}

/** Production-server stand-in: reads PORT/HOST like the built Nitro server and records its env. */
const FAKE_BUNDLE = `
const { createServer } = require('node:http')
const { writeFileSync } = require('node:fs')
writeFileSync(process.env.MAGIC_FAKE_EVE_RECORD, JSON.stringify({
  cwd: process.cwd(),
  host: process.env.HOST,
  port: Number(process.env.PORT),
  token: process.env.MAGIC_EVE_TOKEN,
  modelKey: process.env.MODEL_API_KEY
}))
createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
}).listen(Number(process.env.PORT), process.env.HOST)
`

function makeAppRoot(withEve: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'magic-host-'))
  if (withEve) writeFakeEve(root)
  return root
}

function writeFakeEve(root: string): void {
  const binDir = join(root, 'node_modules', 'eve', 'bin')
  mkdirSync(binDir, { recursive: true })
  writeFileSync(join(binDir, 'eve.js'), FAKE_EVE)
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve((server.address() as { port: number }).port)))
}

const notice = {
  from: { id: 'a', name: 'Before', goal: 'old goal' },
  to: { id: 'b', name: 'School', goal: 'new goal' },
  outgoingTabs: [],
  incomingTabs: []
}

describe('findFreePort', () => {
  it('returns the preferred port when free and a different one when taken', async () => {
    const blocker = createServer()
    const taken = await listen(blocker, 0)
    try {
      await expect(findFreePort(taken)).resolves.not.toBe(taken)
      const free = await findFreePort()
      await expect(findFreePort(free)).resolves.toBe(free)
    } finally {
      blocker.close()
    }
  })
})

describe('EmbeddedAgentHost Eve spawning', () => {
  const servers: Server[] = []
  const hosts: EmbeddedAgentHost[] = []
  const savedEnv = { ...process.env }

  afterEach(async () => {
    await Promise.all(hosts.splice(0).map((h) => h.dispose()))
    servers.splice(0).forEach((s) => s.close())
    process.env = { ...savedEnv }
  })

  it('does not reuse a stale Eve server whose bridge env points at a dead bridge', async () => {
    // A healthy-but-orphaned Eve from a previous launch, listening on the
    // configured port. Reusing it was the "browser bridge unreachable" bug.
    const stale = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
    servers.push(stale)
    const stalePort = await listen(stale, 0)

    const appRoot = makeAppRoot(true)
    const record = join(appRoot, 'record.json')
    process.env.EVE_PORT = String(stalePort)
    process.env.MAGIC_FAKE_EVE_RECORD = record
    delete process.env.EVE_AGENT_URL

    const engine = fakeEngine()
    const host = new EmbeddedAgentHost({ appRoot, engine, runtime, log: () => {}, assistance: { active: true, excludedSites: [], excludedWorkspaceIds: [] } })
    hosts.push(host)

    await expect(host.workspaceSwitched(notice)).resolves.toMatchObject({ status: 'completed' })

    // The host spawned its OWN Eve, on a different port, with THIS host's bridge.
    expect(existsSync(record)).toBe(true)
    const spawned = JSON.parse(readFileSync(record, 'utf8')) as { port: number; bridgeUrl: string; bridgeToken: string }
    expect(spawned.port).not.toBe(stalePort)
    expect(spawned.bridgeUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    // And that bridge actually answers tool calls (the screenshot's failure).
    const res = await fetch(`${spawned.bridgeUrl}/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-magic-bridge-token': spawned.bridgeToken },
      body: JSON.stringify({ target: 'browser', method: 'getSnapshot', args: [] })
    })
    const body = (await res.json()) as { result?: { tabs: unknown[] } }
    expect(body.result?.tabs).toHaveLength(1)
    expect(engine.getSnapshot).toHaveBeenCalled()
  }, 30_000)

  it('retries setup on the next run after a failed setup instead of caching the failure', async () => {
    const appRoot = makeAppRoot(false)
    process.env.MAGIC_FAKE_EVE_RECORD = join(appRoot, 'record.json')
    delete process.env.EVE_AGENT_URL
    delete process.env.EVE_PORT

    const host = new EmbeddedAgentHost({ appRoot, engine: fakeEngine(), runtime, log: () => {}, assistance: { active: true, excludedSites: [], excludedWorkspaceIds: [] } })
    hosts.push(host)

    await expect(host.workspaceSwitched(notice)).resolves.toMatchObject({ status: 'skipped', reason: expect.stringContaining('Eve is not installed') })

    writeFakeEve(appRoot)
    await expect(host.workspaceSwitched(notice)).resolves.toMatchObject({ status: 'completed' })
  }, 30_000)

  it('runs the bundled production server from a writable state dir with a per-launch token', async () => {
    const root = makeAppRoot(false)
    const serverEntry = join(root, 'agent', 'server', 'index.cjs')
    mkdirSync(join(root, 'agent', 'server'), { recursive: true })
    writeFileSync(serverEntry, FAKE_BUNDLE)
    const stateDir = join(root, 'user-data', 'agent')
    const record = join(root, 'record.json')
    process.env.MAGIC_FAKE_EVE_RECORD = record
    process.env.MODEL_API_KEY = 'test-key'
    delete process.env.EVE_AGENT_URL
    delete process.env.EVE_PORT

    const host = new EmbeddedAgentHost({ appRoot: root, eveBundle: { serverEntry, stateDir }, engine: fakeEngine(), runtime, log: () => {}, assistance: { active: true, excludedSites: [], excludedWorkspaceIds: [] } })
    hosts.push(host)
    await expect(host.workspaceSwitched(notice)).resolves.toMatchObject({ status: 'completed' })

    const spawned = JSON.parse(readFileSync(record, 'utf8')) as { cwd: string; host: string; token: string; modelKey: string }
    expect(spawned.cwd).toBe(realpathSync(stateDir))
    expect(spawned.host).toBe('127.0.0.1')
    expect(spawned.token).toMatch(/^[\w-]{32}$/)
    expect(spawned.modelKey).toBe('test-key')
  }, 30_000)

  it('skips with a Settings hint instead of spawning when no model key is set', async () => {
    const appRoot = makeAppRoot(true)
    const record = join(appRoot, 'record.json')
    process.env.MAGIC_FAKE_EVE_RECORD = record
    delete process.env.MODEL_API_KEY
    delete process.env.AGENT_MODEL_PROVIDER
    delete process.env.EVE_AGENT_URL

    const host = new EmbeddedAgentHost({ appRoot, engine: fakeEngine(), log: () => {}, assistance: { active: true, excludedSites: [], excludedWorkspaceIds: [] } })
    hosts.push(host)
    await expect(host.ask('hi', { workspace: null, tabs: [] })).resolves.toMatchObject({ status: 'skipped', reason: MISSING_KEY_REASON })
    await expect(host.assessDrift({ workspace: { id: 'w', name: 'W', goal: 'g' }, tabs: [{ id: 't', title: 'T', url: 'https://x.com' }] }))
      .resolves.toMatchObject({ status: 'skipped', reason: MISSING_KEY_REASON })
    expect(existsSync(record)).toBe(false)
  })
})
